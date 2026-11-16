// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title GroceryCheckout
/// @notice Pay for a grocery order with Monad, like PayPal + DoorDash.
///
///   1. The student places an order for pickup or delivery. The full amount (groceries,
///      delivery fee, tip) moves into this contract and is held in escrow.
///   2. The store accepts it and marks it ready.
///   3. Pickup: the store finishes the order at the counter.
///      Delivery: a driver claims it, delivers it, and finishes the order at the door.
///   4. Finishing needs the student's handoff code. The contract only stores a hash of it
///      (commit-reveal), so the order can't be marked done without the student. In the same
///      transaction it pays the store for the groceries and the driver the delivery fee + tip.
///
///   The student can cancel for a full refund until the store accepts. The store can refund
///   any time before the order is finished.
contract GroceryCheckout {
    enum Kind {
        Pickup,
        Delivery
    }

    enum Status {
        None,
        Placed,
        Accepted,
        Ready,
        OutForDelivery,
        Completed,
        Cancelled,
        Refunded
    }

    struct Store {
        address owner;
        string name;
    }

    struct Order {
        address buyer;
        uint32 storeId;
        Kind kind;
        Status status;
        uint40 placedAt;
        uint40 updatedAt;
        address driver;
        uint96 subtotal; // groceries, in token units (6 decimals)
        uint96 deliveryFee;
        uint96 tip;
        bytes32 codeHash; // keccak256(abi.encodePacked(buyer, code))
        bytes32 itemsHash; // hash of the item list, so the receipt can be checked later
    }

    IERC20 public immutable token;

    Store[] internal _stores;
    Order[] internal _orders;
    mapping(address => uint256[]) internal _buyerOrders;
    mapping(uint256 => uint256[]) internal _storeOrders;

    event StoreRegistered(uint256 indexed storeId, address indexed owner, string name);
    event OrderPlaced(
        uint256 indexed orderId, address indexed buyer, uint256 indexed storeId, Kind kind, uint256 total, bytes32 itemsHash
    );
    event OrderStatus(uint256 indexed orderId, Status status, address indexed by);
    event OrderPaidOut(uint256 indexed orderId, address store, uint256 storeAmount, address driver, uint256 driverAmount);
    event OrderRefunded(uint256 indexed orderId, address indexed buyer, uint256 amount);

    error NotStoreOwner();
    error NotBuyer();
    error NotDriver();
    error BadStatus(Status current);
    error BadStore();
    error BadOrder();
    error WrongCode();
    error EmptyOrder();
    error PickupHasNoDelivery();
    error TransferFailed();

    constructor(IERC20 token_) {
        token = token_;
    }

    // ---------------------------------------------------------------- stores

    function registerStore(string calldata name) external returns (uint256 storeId) {
        storeId = _stores.length;
        _stores.push(Store({owner: msg.sender, name: name}));
        emit StoreRegistered(storeId, msg.sender, name);
    }

    // ---------------------------------------------------------------- student

    function placeOrder(
        uint256 storeId,
        Kind kind,
        uint96 subtotal,
        uint96 deliveryFee,
        uint96 tip,
        bytes32 itemsHash,
        bytes32 codeHash
    ) external returns (uint256 orderId) {
        if (storeId >= _stores.length) revert BadStore();
        if (subtotal == 0) revert EmptyOrder();
        if (kind == Kind.Pickup && deliveryFee != 0) revert PickupHasNoDelivery();

        orderId = _orders.length;
        _orders.push(
            Order({
                buyer: msg.sender,
                storeId: uint32(storeId),
                kind: kind,
                status: Status.Placed,
                placedAt: uint40(block.timestamp),
                updatedAt: uint40(block.timestamp),
                driver: address(0),
                subtotal: subtotal,
                deliveryFee: deliveryFee,
                tip: tip,
                codeHash: codeHash,
                itemsHash: itemsHash
            })
        );
        _buyerOrders[msg.sender].push(orderId);
        _storeOrders[storeId].push(orderId);

        uint256 total = uint256(subtotal) + deliveryFee + tip;
        emit OrderPlaced(orderId, msg.sender, storeId, kind, total, itemsHash);
        emit OrderStatus(orderId, Status.Placed, msg.sender);

        // Interactions last: pull the money into escrow.
        if (!token.transferFrom(msg.sender, address(this), total)) revert TransferFailed();
    }

    /// @notice Cancel for a full refund, only before the store accepts.
    function cancel(uint256 orderId) external {
        Order storage o = _order(orderId);
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.status != Status.Placed) revert BadStatus(o.status);
        _refund(orderId, o, Status.Cancelled);
    }

    // ---------------------------------------------------------------- store

    function accept(uint256 orderId) external {
        Order storage o = _order(orderId);
        _onlyStore(o);
        _move(orderId, o, Status.Placed, Status.Accepted);
    }

    function markReady(uint256 orderId) external {
        Order storage o = _order(orderId);
        _onlyStore(o);
        _move(orderId, o, Status.Accepted, Status.Ready);
    }

    /// @notice The store can refund the student any time before the order is finished.
    function refund(uint256 orderId) external {
        Order storage o = _order(orderId);
        _onlyStore(o);
        if (o.status == Status.Completed || o.status == Status.Cancelled || o.status == Status.Refunded) {
            revert BadStatus(o.status);
        }
        _refund(orderId, o, Status.Refunded);
    }

    // ---------------------------------------------------------------- driver

    /// @notice A driver takes a delivery order that's ready.
    function claimDelivery(uint256 orderId) external {
        Order storage o = _order(orderId);
        if (o.kind != Kind.Delivery) revert BadOrder();
        o.driver = msg.sender;
        _move(orderId, o, Status.Ready, Status.OutForDelivery);
    }

    // ---------------------------------------------------------------- handoff

    /// @notice Finish the order with the student's handoff code, and pay out in one step.
    ///         Pickup: called by the store. Delivery: called by the driver who claimed it.
    function complete(uint256 orderId, string calldata code) external {
        Order storage o = _order(orderId);
        if (o.kind == Kind.Pickup) {
            _onlyStore(o);
            if (o.status != Status.Ready) revert BadStatus(o.status);
        } else {
            if (msg.sender != o.driver) revert NotDriver();
            if (o.status != Status.OutForDelivery) revert BadStatus(o.status);
        }
        if (keccak256(abi.encodePacked(o.buyer, code)) != o.codeHash) revert WrongCode();

        o.status = Status.Completed;
        o.updatedAt = uint40(block.timestamp);
        emit OrderStatus(orderId, Status.Completed, msg.sender);

        address storeOwner = _stores[o.storeId].owner;
        // Pickup tips go to the store; delivery fee + tip go to the driver.
        uint256 storeAmount = o.kind == Kind.Pickup ? uint256(o.subtotal) + o.tip : o.subtotal;
        uint256 driverAmount = o.kind == Kind.Pickup ? 0 : uint256(o.deliveryFee) + o.tip;
        emit OrderPaidOut(orderId, storeOwner, storeAmount, o.driver, driverAmount);

        if (!token.transfer(storeOwner, storeAmount)) revert TransferFailed();
        if (driverAmount != 0 && !token.transfer(o.driver, driverAmount)) revert TransferFailed();
    }

    // ---------------------------------------------------------------- views

    function storeCount() external view returns (uint256) {
        return _stores.length;
    }

    function getStore(uint256 storeId) external view returns (Store memory) {
        if (storeId >= _stores.length) revert BadStore();
        return _stores[storeId];
    }

    function orderCount() external view returns (uint256) {
        return _orders.length;
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _order(orderId);
    }

    function ordersOf(address buyer) external view returns (uint256[] memory) {
        return _buyerOrders[buyer];
    }

    function ordersForStore(uint256 storeId) external view returns (uint256[] memory) {
        return _storeOrders[storeId];
    }

    // ---------------------------------------------------------------- internal

    function _order(uint256 orderId) internal view returns (Order storage) {
        if (orderId >= _orders.length) revert BadOrder();
        return _orders[orderId];
    }

    function _onlyStore(Order storage o) internal view {
        if (msg.sender != _stores[o.storeId].owner) revert NotStoreOwner();
    }

    function _move(uint256 orderId, Order storage o, Status from, Status to) internal {
        if (o.status != from) revert BadStatus(o.status);
        o.status = to;
        o.updatedAt = uint40(block.timestamp);
        emit OrderStatus(orderId, to, msg.sender);
    }

    function _refund(uint256 orderId, Order storage o, Status to) internal {
        o.status = to;
        o.updatedAt = uint40(block.timestamp);
        uint256 amount = uint256(o.subtotal) + o.deliveryFee + o.tip;
        emit OrderStatus(orderId, to, msg.sender);
        emit OrderRefunded(orderId, o.buyer, amount);
        if (!token.transfer(o.buyer, amount)) revert TransferFailed();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CampusCart: pay a grocery store on Monad, release the money when you get your food.
/// @notice A student pays for a grocery order up front. The money sits in this contract (escrow)
///         until the student confirms pickup or delivery, then goes to the store. If the store
///         rejects the order, or never accepts it within an hour, the student gets a full refund.
contract CampusCart {
    enum Status {
        None,
        Placed, // paid, waiting for the store
        Accepted, // store is packing it
        Ready, // ready for pickup / out for delivery
        Completed, // student confirmed, store was paid
        Cancelled // refunded to the student
    }

    enum Method {
        Pickup,
        Delivery
    }

    struct Order {
        uint256 id;
        address buyer;
        address store;
        uint256 amount;
        uint64 placedAt;
        uint64 updatedAt;
        Status status;
        Method method;
        string details; // JSON: items, store location, pickup slot or delivery address
    }

    uint64 public constant ACCEPT_WINDOW = 1 hours;

    mapping(address => string) public storeName;
    address[] internal storeList;
    Order[] internal orders; // order id = index + 1
    mapping(address => uint256[]) internal buyerOrders;
    mapping(address => uint256[]) internal storeOrders;

    event StoreRegistered(address indexed store, string name);
    event OrderPlaced(uint256 indexed id, address indexed buyer, address indexed store, uint256 amount, Method method);
    event OrderStatus(uint256 indexed id, Status status);
    event Paid(uint256 indexed id, address indexed store, uint256 amount);
    event Refunded(uint256 indexed id, address indexed buyer, uint256 amount);

    error UnknownStore();
    error NoPayment();
    error NotFound();
    error NotAllowed();
    error WrongStatus();
    error TransferFailed();

    // ---------- stores ----------

    /// @notice A store (or the demo store wallet) signs up to receive orders.
    function registerStore(string calldata name) external {
        if (bytes(storeName[msg.sender]).length == 0) storeList.push(msg.sender);
        storeName[msg.sender] = name;
        emit StoreRegistered(msg.sender, name);
    }

    function stores() external view returns (address[] memory) {
        return storeList;
    }

    // ---------- orders ----------

    /// @notice Pay for an order. The MON sent is held until the student confirms they got it.
    function placeOrder(address store, Method method, string calldata details) external payable returns (uint256 id) {
        if (bytes(storeName[store]).length == 0) revert UnknownStore();
        if (msg.value == 0) revert NoPayment();
        id = orders.length + 1;
        orders.push(
            Order({
                id: id,
                buyer: msg.sender,
                store: store,
                amount: msg.value,
                placedAt: uint64(block.timestamp),
                updatedAt: uint64(block.timestamp),
                status: Status.Placed,
                method: method,
                details: details
            })
        );
        buyerOrders[msg.sender].push(id);
        storeOrders[store].push(id);
        emit OrderPlaced(id, msg.sender, store, msg.value, method);
        emit OrderStatus(id, Status.Placed);
    }

    /// @notice Store accepts and starts packing the order.
    function accept(uint256 id) external {
        Order storage o = _order(id);
        if (msg.sender != o.store) revert NotAllowed();
        if (o.status != Status.Placed) revert WrongStatus();
        _set(o, Status.Accepted);
    }

    /// @notice Store marks the order ready for pickup (or handed to the driver for delivery).
    function markReady(uint256 id) external {
        Order storage o = _order(id);
        if (msg.sender != o.store) revert NotAllowed();
        if (o.status != Status.Accepted) revert WrongStatus();
        _set(o, Status.Ready);
    }

    /// @notice Student confirms they have their groceries: the store gets paid.
    function confirmReceived(uint256 id) external {
        Order storage o = _order(id);
        if (msg.sender != o.buyer) revert NotAllowed();
        if (o.status != Status.Ready && o.status != Status.Accepted) revert WrongStatus();
        _set(o, Status.Completed);
        uint256 amount = o.amount;
        (bool ok, ) = payable(o.store).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Paid(id, o.store, amount);
    }

    /// @notice Refund paths:
    ///  - the student cancels before the store accepts
    ///  - the store rejects an order it hasn't finished
    ///  - anyone can trigger a refund if the store hasn't accepted within ACCEPT_WINDOW
    function cancel(uint256 id) external {
        Order storage o = _order(id);
        bool buyerEarly = msg.sender == o.buyer && o.status == Status.Placed;
        bool storeRejects = msg.sender == o.store && (o.status == Status.Placed || o.status == Status.Accepted);
        bool stale = o.status == Status.Placed && block.timestamp > o.placedAt + ACCEPT_WINDOW;
        if (!buyerEarly && !storeRejects && !stale) revert NotAllowed();
        _set(o, Status.Cancelled);
        uint256 amount = o.amount;
        (bool ok, ) = payable(o.buyer).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Refunded(id, o.buyer, amount);
    }

    // ---------- views ----------

    function orderCount() external view returns (uint256) {
        return orders.length;
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        return _orderView(id);
    }

    function ordersOfBuyer(address buyer) external view returns (uint256[] memory) {
        return buyerOrders[buyer];
    }

    function ordersOfStore(address store) external view returns (uint256[] memory) {
        return storeOrders[store];
    }

    // ---------- internal ----------

    function _order(uint256 id) internal view returns (Order storage) {
        if (id == 0 || id > orders.length) revert NotFound();
        return orders[id - 1];
    }

    function _orderView(uint256 id) internal view returns (Order memory) {
        if (id == 0 || id > orders.length) revert NotFound();
        return orders[id - 1];
    }

    function _set(Order storage o, Status s) internal {
        o.status = s;
        o.updatedAt = uint64(block.timestamp);
        emit OrderStatus(o.id, s);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @title CampusDollar (cfUSD)
/// @notice A test dollar for the CampusFuel demo on Monad testnet. 6 decimals, like USDC.
///         Anyone can claim test dollars from the faucet. It has no real-world value.
contract CampusDollar {
    string public constant name = "CampusFuel Test Dollar";
    string public constant symbol = "cfUSD";
    uint8 public constant decimals = 6;

    uint256 public constant FAUCET_AMOUNT = 100e6; // $100 per claim
    uint256 public constant FAUCET_MAX_BALANCE = 500e6; // no claims above $500

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error FaucetLimit();
    error InsufficientBalance();
    error InsufficientAllowance();

    /// @notice Claim $100 of test dollars (only while your balance is under $500).
    function faucet() external {
        if (balanceOf[msg.sender] >= FAUCET_MAX_BALANCE) revert FaucetLimit();
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        uint256 bal = balanceOf[from];
        if (bal < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }
}

pragma solidity ^0.5.0;

/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract IMultisigCarrier {

    function vaultParties(
        address vaultAddress
    ) public view returns (address[] memory);

    function approveFrom(
        address caller,
        address payable destination,
        address currencyAddress,
        uint256 amount
    ) public returns (bool);

}

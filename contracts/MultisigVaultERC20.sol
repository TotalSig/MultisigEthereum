pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract MultisigVaultERC20 {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct Approval {
        uint32 nonce;
        uint8  coincieded;
        bool   skipFee;
        address[] coinciedeParties;
    }

    uint8 private participantsAmount;
    uint8 private signatureMinThreshold;
    uint32 private nonce;
    address public currencyAddress;
    uint16 private serviceFeeMicro;
    address private _owner;

    mapping(address => bool) public parties;

    mapping(
        // Destination
        address => mapping(
            // Amount
            uint256 => Approval
        )
    ) public approvals;

    mapping(uint256 => bool) public finished;

    event ConfirmationReceived(address indexed from, address indexed destination, address currency, uint256 amount);
    event ConsensusAchived(address indexed destination, address currency, uint256 amount);

    /**
      * @dev Construcor.
      *
      * Requirements:
      * - `_signatureMinThreshold` .
      * - `_parties`.
      */
    constructor(
        uint8 _signatureMinThreshold,
        address[] memory _parties,
        address _currencyAddress
    ) public {
        require(_parties.length > 0 && _parties.length <= 10);
        require(_signatureMinThreshold > 0 && _signatureMinThreshold <= _parties.length);

        _owner = msg.sender;

        signatureMinThreshold = _signatureMinThreshold;
        currencyAddress = _currencyAddress;

        for (uint256 i = 0; i < _parties.length; i++) parties[_parties[i]] = true;

        serviceFeeMicro = 5000; // Of a million or 0.5%
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Returns true if the caller is the current owner.
     */
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    /**
     * @dev Returns the nonce number of releasing transaction by destination and amount.
     */
    function getNonce(
        address _destination,
        uint256 _amount
    ) public view returns (uint256) {
        Approval storage approval = approvals[_destination][_amount];

        return approval.nonce;
    }


    /**
     * @dev Returns boolean id party provided its approval.
     */
    function partyCoincieded(
        address _destination,
        uint256 _amount,
        uint256 _nonce,
        address _partyAddress
    ) public view returns (bool) {
        if ( finished[_nonce] ) {
          return true;
        } else {
          Approval storage approval = approvals[_destination][_amount];

          for (uint i=0; i<approval.coinciedeParties.length; i++) {
             if (approval.coinciedeParties[i] == _partyAddress) return true;
          }

          return false;
        }
    }

    function approve(
        address _destination,
        uint256 _amount
    ) public returns (bool) {
        approveAndRelease( _destination, _amount, false);
    }


    function regress(
        address _destination,
        uint256 _amount
    ) public onlyOwner() returns (bool) {
        approveAndRelease( _destination, _amount, true);
    }


    function approveAndRelease(
        address _destination,
        uint256 _amount,
        bool    _skipServiceFee
    ) internal returns (bool) {
       require(parties[msg.sender], "Release: not a member");
       require(token().balanceOf(address(this)) >= _amount, "Release:  insufficient balance");

       Approval storage approval = approvals[_destination][_amount]; // Create new project

       bool coinciedeParties = false;
       for (uint i=0; i<approval.coinciedeParties.length; i++) {
          if (approval.coinciedeParties[i] == msg.sender) coinciedeParties = true;
       }

       require(!coinciedeParties, "Release: party already approved");

       if (approval.coincieded == 0) {
           nonce += 1;
           approval.nonce = nonce;
       }

       approval.coinciedeParties.push(msg.sender);
       approval.coincieded += 1;

       if (_skipServiceFee) {
           approval.skipFee = true;
       }

       emit ConfirmationReceived(msg.sender, _destination, currencyAddress, _amount);

       if ( approval.coincieded >= signatureMinThreshold ) {
           releaseFunds(_destination, _amount, approval.skipFee);
           finished[approval.nonce] = true;
           delete approvals[_destination][_amount];

           emit ConsensusAchived(_destination, currencyAddress, _amount);
       }

      return false;
    }

    function releaseFunds(
      address _destination,
      uint256 _amount,
      bool    _skipServiceFee
    ) internal {
        if (_skipServiceFee) {
            token().safeTransfer(_destination, _amount); // Release funds
        } else {
            uint256 _amountToWithhold = _amount.mul(serviceFeeMicro).div(1000000);
            uint256 _amountToRelease = _amount.sub(_amountToWithhold);

            token().safeTransfer(_destination, _amountToRelease); // Release funds
            token().safeTransfer(serviceAddress(), _amountToWithhold);   // Take service margin
        }
    }

    function token() public view returns (IERC20) {
        return IERC20(currencyAddress);
    }

    function serviceAddress() public pure returns (address) {
        return address(0x0A67A2cdC35D7Db352CfBd84fFF5e5F531dF62d1);
    }
}

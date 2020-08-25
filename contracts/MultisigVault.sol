pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract MultisigVault {

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
    address private _owner;

    mapping(address => bool) public parties;

    mapping(
        // Destination
        address => mapping(
            // Currency
            address => mapping(
                // Amount
                uint256 => Approval
            )
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
    constructor() public {
        _owner = msg.sender;
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
        address _currencyAddress,
        uint256 _amount
    ) public view returns (uint256) {
        Approval storage approval = approvals[_destination][_currencyAddress][_amount];

        return approval.nonce;
    }


    function setParties(
        uint8 _signatureMinThreshold,
        address[] memory _parties
    ) public onlyOwner() returns (bool) {
        require(signatureMinThreshold == 0, "Parties are already set");
        require(_parties.length > 0 && _parties.length <= 10, "Max 10 parties");
        require(_signatureMinThreshold > 0 && _signatureMinThreshold <= _parties.length, "Min signatures mismatches Parties array");

        signatureMinThreshold = _signatureMinThreshold;

        for (uint256 i = 0; i < _parties.length; i++) parties[_parties[i]] = true;

        require(parties[msg.sender], "Sender should be among parties");

        return true;
    }


    /**
     * @dev Returns boolean id party provided its approval.
     */
    function partyCoincieded(
        address _destination,
        address _currencyAddress,
        uint256 _amount,
        uint256 _nonce,
        address _partyAddress
    ) public view returns (bool) {
        if ( finished[_nonce] ) {
          return true;
        } else {
          Approval storage approval = approvals[_destination][_currencyAddress][_amount];

          for (uint i=0; i<approval.coinciedeParties.length; i++) {
             if (approval.coinciedeParties[i] == _partyAddress) return true;
          }

          return false;
        }
    }

    function approve(
        address payable _destination,
        address _currencyAddress,
        uint256 _amount
    ) public returns (bool) {
        approveAndRelease(_destination, _currencyAddress, _amount, false);
    }


    function regress(
        address payable _destination,
        address _currencyAddress,
        uint256 _amount
    ) public onlyOwner() returns (bool) {
        approveAndRelease(_destination, _currencyAddress, _amount, true);
    }


    function approveAndRelease(
        address payable _destination,
        address _currencyAddress,
        uint256 _amount,
        bool    _skipServiceFee
    ) internal returns (bool) {
       require(parties[msg.sender], "Release: not a member");
       if (_currencyAddress == etherAddress()) {
         address multisig = address(this);  // https://biboknow.com/page-ethereum/78597/solidity-0-6-0-addressthis-balance-throws-error-invalid-opcode
         require(multisig.balance >= _amount, "Release:  insufficient balance");
       } else {
         require(token(_currencyAddress).balanceOf(address(this)) >= _amount, "Release:  insufficient balance");
       }

       Approval storage approval = approvals[_destination][_currencyAddress][_amount];

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

       emit ConfirmationReceived(msg.sender, _destination, _currencyAddress, _amount);

       if ( approval.coincieded >= signatureMinThreshold ) {
           if (_currencyAddress == etherAddress()) {
               releaseETHFunds(_destination, _amount, approval.skipFee);
           } else {
               releaseTokenFunds(_destination, _currencyAddress, _amount, approval.skipFee);
           }
           finished[approval.nonce] = true;
           delete approvals[_destination][_currencyAddress][_amount];

           emit ConsensusAchived(_destination, _currencyAddress, _amount);
       }

      return false;
    }

    function releaseETHFunds(
      address payable _destination,
      uint256 _amount,
      bool    _skipServiceFee
    ) internal {
        if (_skipServiceFee) {
            _destination.transfer(_amount); // Release funds
        } else {
            uint256 _amountToWithhold = _amount.mul(serviceFeeMicro()).div(1000000);
            uint256 _amountToRelease = _amount.sub(_amountToWithhold);

            _destination.transfer(_amountToRelease); // Release funds
            address payable _serviceAddress = address(uint160(serviceAddress())); // convert service address to payable
            _serviceAddress.transfer(_amountToWithhold);   // Take service margin
        }
    }

    function releaseTokenFunds(
      address _destination,
      address _currencyAddress,
      uint256 _amount,
      bool    _skipServiceFee
    ) internal {
        if (_skipServiceFee) {
            token(_currencyAddress).safeTransfer(_destination, _amount); // Release funds
        } else {
            uint256 _amountToWithhold = _amount.mul(serviceFeeMicro()).div(1000000);
            uint256 _amountToRelease = _amount.sub(_amountToWithhold);

            token(_currencyAddress).safeTransfer(_destination, _amountToRelease); // Release funds
            token(_currencyAddress).safeTransfer(serviceAddress(), _amountToWithhold);   // Take service margin
        }
    }


    function token(address _currencyAddress) public view returns (IERC20) {
        return IERC20(_currencyAddress);
    }

    function etherAddress() public pure returns (address) {
        return address(0x0);
    }

    function serviceAddress() public pure returns (address) {
        return address(0x0A67A2cdC35D7Db352CfBd84fFF5e5F531dF62d1);
    }

    function serviceFeeMicro() public pure returns (uint16) {
        return uint16(5000);
    }

    function () external payable {}
}

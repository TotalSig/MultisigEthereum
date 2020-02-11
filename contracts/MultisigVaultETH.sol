pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract MultisigVaultETH {

    using SafeMath for uint256;

    struct Approval {
        uint256 nonce;
        uint256 coincieded;
        address[] coinciedeParties;
    }

    uint256 private participantsAmount;
    uint256 private signatureMinThreshold;
    uint256 private nonce;
    address payable private serviceAddress;
    uint256 private serviceFeeMicro;

    string  private _symbol;
    uint8   private _decimals;

    address constant public ETHER_ADDRESS = address(0x1);

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
      * - `_serviceAddress`.
      * - `_serviceFeeMicro` represented by integer amount of million'th fractions.
      */
    constructor(
        uint256 _signatureMinThreshold,
        address[] memory _parties,
        address payable _serviceAddress,
        uint256 _serviceFeeMicro
    ) public {
        require(_parties.length > 0 && _parties.length <= 10);
        require(_signatureMinThreshold > 0 && _signatureMinThreshold <= _parties.length);

        signatureMinThreshold = _signatureMinThreshold;
        serviceAddress = _serviceAddress;
        serviceFeeMicro = _serviceFeeMicro;

        _symbol = "ETH";
        _decimals = 18;

        for (uint256 i = 0; i < _parties.length; i++) parties[_parties[i]] = true;
    }

    modifier isMember() {
        require(parties[msg.sender]);
        _;
    }

    modifier sufficient(uint256 _amount) {
        // https://biboknow.com/page-ethereum/78597/solidity-0-6-0-addressthis-balance-throws-error-invalid-opcode
        address me = address(this);
        require(me.balance >= _amount);
        _;
    }

    function getNonce(
        address _destination,
        uint256 _amount
    ) public view returns (uint256) {
        Approval storage approval = approvals[_destination][_amount];

        return approval.nonce;
    }

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

    // https://ethereum.stackexchange.com/questions/19341/address-send-vs-address-transfer-best-practice-usage
    function approve(
        address payable _destination,
        uint256 _amount
    ) public isMember sufficient(_amount) returns (bool) {
        Approval storage approval = approvals[_destination][_amount]; // Initiate new approval

        bool coinciedeParties = false;
        for (uint i=0; i<approval.coinciedeParties.length; i++) {
           if (approval.coinciedeParties[i] == msg.sender) coinciedeParties = true;
        }

        require(!coinciedeParties);

        if (approval.coincieded == 0) {
            nonce += 1;
            approval.nonce = nonce;
        }

        approval.coinciedeParties.push(msg.sender);
        approval.coincieded += 1;

        emit ConfirmationReceived(msg.sender, _destination, ETHER_ADDRESS, _amount);

        if ( approval.coincieded >= signatureMinThreshold ) {
            uint256 _amountToWithhold = _amount.mul(serviceFeeMicro).div(1000000);
            uint256 _amountToRelease = _amount.sub(_amountToWithhold);

            _destination.transfer(_amountToRelease);    // Release funds
            serviceAddress.transfer(_amountToWithhold); // Withhold service fee

            finished[approval.nonce] = true;
            delete approvals[_destination][_amount];
            emit ConsensusAchived(_destination, ETHER_ADDRESS, _amount);
        }

        return true;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function() external payable { }
}

// /*global contract, config, it, assert*/
const { assertRevert } = require('./helpers/assertRevert');
const EursTestToken = artifacts.require("EursTestToken");
const MultisigVaultERC20 = artifacts.require("MultisigVaultERC20");

const ETHER = 1000000000000000000;

contract("MultisigVaultERC20", accounts => {
  beforeEach(async function () {
    this.owner = accounts[0];
    this.party1 = accounts[1];
    this.party2 = accounts[2];
    this.serviceAddress = accounts[3];

    this.destination = "0x0123456789012345678901234567890123456789";
    this.amount = "1000000000000000000";
    this.percent = 0.005; // Half a percent
    this.percentMicro = 1000000 * this.percent;

    this.EursTestToken = await EursTestToken.new({ from: this.owner });
    this.MultisigVaultERC20 = await MultisigVaultERC20.new(2, [this.party1, this.party2], this.serviceAddress, this.percentMicro, this.EursTestToken.address, { from: this.owner });

    this.EursTestToken.mint(this.party1, this.amount, { from: this.owner });
  });

  it('should return new vault address', async function () {
    assert(/^0x([a-fA-F0-9]{40})$/.test(this.MultisigVaultERC20.address));
  });

  it('should return token details', async function () {
    const symbol = await this.MultisigVaultERC20.symbol.call();
    const decimals = await this.MultisigVaultERC20.decimals.call();

    assert.equal(symbol, "EURS");
    assert.equal(decimals, 2);
  });

  describe('owner', function() {
    describe('empty balance', function() {
      it('should not let approve', async function () {
        await assertRevert(
          this.MultisigVaultERC20.approve(
            this.destination,
            this.amount, // 1 ETH
            { from: this.owner }
          )
        );
      })
    });

    describe('balance ready', function() {
      it('should not let approve', async function () {
        this.EursTestToken.transfer(this.MultisigVaultERC20.address, this.amount, { from: this.party1 });

        await assertRevert(
          this.MultisigVaultERC20.approve(
            this.destination,
            this.amount, // 1 ETH
            { from: this.owner }
          )
        );
      });
    });
  });

  describe('empty balance', function() {
    it('should not let approve', async function () {
      await assertRevert(
        this.MultisigVaultERC20.approve(
          this.destination,
          this.amount, // 1 ETH
          { from: this.party1 }
        )
      );
    });
  });

  describe('balance ready', function() {
    beforeEach(async function () {
      this.EursTestToken.transfer(this.MultisigVaultERC20.address, this.amount, { from: this.party1 });
    });

    describe('party 1 approved', function () {
      beforeEach(async function () {
        this.tx = await this.MultisigVaultERC20.approve(
          this.destination,
          this.amount, // 1 ETH
          { from: this.party1 }
        )
      });

      it('should emit log', async function () {
        assert.equal(this.tx.receipt.status, true);
        assert.equal(this.tx.logs[0].event, "ConfirmationReceived", "ConfirmationReceived event not emitted");
      })

      it('should have balance on escrow', async function () {
        const escrowBalance = await this.EursTestToken.balanceOf.call(this.MultisigVaultERC20.address);
        assert.equal(escrowBalance, 1*ETHER);
      });

      it('should tell about approval', async function () {
        const nonce = await this.MultisigVaultERC20.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce > 0);

        const approval = await this.MultisigVaultERC20.partyCoincieded.call(
          this.destination,
          this.amount, // 1 ETH
          nonce,
          this.party1
        );
        assert.ok(approval);
      });

      it('should change nonce', async function () {
        const nonce1 = await this.MultisigVaultERC20.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce1 > 0);

        await this.MultisigVaultERC20.approve(
          this.destination,
          this.amount, // 1 ETH
          { from: this.party2 }
        )

        const nonce2 = await this.MultisigVaultERC20.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce2 == 0);
      });

      describe('party2 approved', function () {
        beforeEach(async function () {
          this.destinationBalanceBefore = await this.EursTestToken.balanceOf.call(this.destination);
          this.serviceBalanceBefore = await this.EursTestToken.balanceOf.call(this.serviceAddress);

          this.nonce = await this.MultisigVaultERC20.getNonce.call(
            this.destination,
            this.amount // 1 ETH
          );

          this.tx2 = await this.MultisigVaultERC20.approve(
            this.destination,
            this.amount, // 1 ETH
            { from: this.party2 }
          )
        });

        it('not have balance', async function () {
          const escrowBalance = await this.EursTestToken.balanceOf.call(this.MultisigVaultERC20.address);
          assert.equal(escrowBalance, 0);
        });

        it('should emit logs', async function () {
          assert.equal(this.tx2.receipt.status, true);
          assert.equal(this.tx2.logs[0].event, "ConfirmationReceived", "ConfirmationReceived event not emitted");
          assert.equal(this.tx2.logs[1].event, "ConsensusAchived", "ConsensusAchived event not emitted");
        });

        it('should tell about approval', async function () {
          const approval = await this.MultisigVaultERC20.partyCoincieded.call(
            this.destination,
            this.amount, // 1 ETH
            this.nonce,
            this.party2
          );
          assert.ok(approval);
        });

        it('should tell about approval', async function () {
          const destinationBalanceAfter = await this.EursTestToken.balanceOf.call(this.destination);
          const serviceBalanceAfter = await this.EursTestToken.balanceOf.call(this.serviceAddress);

          const destinationBalanceChanged = destinationBalanceAfter - this.destinationBalanceBefore;
          const serviceBalanceChanged = serviceBalanceAfter - this.serviceBalanceBefore;

          assert.equal(destinationBalanceChanged, (1-this.percent)*ETHER);
          assert.equal(serviceBalanceChanged, this.percent*ETHER);
        });
      });
    });
  });
})

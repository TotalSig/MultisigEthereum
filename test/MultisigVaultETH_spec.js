// /*global contract, config, it, assert*/
const { assertRevert } = require('./helpers/assertRevert');
const multisigVaultETH = artifacts.require("MultisigVaultETH");

const ETHER = 1000000000000000000;

contract("multisigVaultETH", accounts => {
  beforeEach(async function () {
    this.owner = accounts[0];
    this.party1 = accounts[1];
    this.party2 = accounts[2];
    this.serviceAddress = "0x0A67A2cdC35D7Db352CfBd84fFF5e5F531dF62d1";

    this.destination = "0x0123456789012345678901234567890123456789";
    this.amount = "1000000000000000000";
    this.percent = 0.005; // Half a percent
    this.percentMicro = 1000000 * this.percent;

    this.multisigVaultETH = await multisigVaultETH.new(2, [this.party1, this.party2], { from: this.party1 });
  });

  describe('owner', function() {
    describe('empty balance', function() {
      it('should not let approve', async function () {
        await assertRevert(
          this.multisigVaultETH.approve(
            this.destination,
            this.amount, // 1 ETH
            { from: this.owner }
          )
        );
      });
    });

    describe('balance ready', function() {
      it('should not let approve', async function () {
        this.multisigVaultETH.sendTransaction({ from: this.party1, value: 1*ETHER })

        await assertRevert(
          this.multisigVaultETH.approve(
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
        this.multisigVaultETH.approve(
          this.destination,
          this.amount, // 1 ETH
          { from: this.party1 }
        )
      );
    });
  });

  describe('balance ready', function() {
    beforeEach(async function () {
        this.multisigVaultETH.sendTransaction({ from: this.party1, value: 1*ETHER })
    });

    describe('party 1 approved', function () {
      beforeEach(async function () {
        this.tx = await this.multisigVaultETH.approve(
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
        const escrowBalance = await web3.eth.getBalance(this.multisigVaultETH.address);
        assert.equal(escrowBalance, 1*ETHER);
      });

      it('should tell about approval', async function () {
        const nonce = await this.multisigVaultETH.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce > 0);

        const approval = await this.multisigVaultETH.partyCoincieded.call(
          this.destination,
          this.amount, // 1 ETH
          nonce,
          this.party1
        );
        assert.ok(approval);
      });

      it('should change nonce', async function () {
        const nonce1 = await this.multisigVaultETH.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce1 > 0);

        await this.multisigVaultETH.approve(
          this.destination,
          this.amount, // 1 ETH
          { from: this.party2 }
        )

        const nonce2 = await this.multisigVaultETH.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce2 == 0);
      });

      describe('party2 approved', function () {
        beforeEach(async function () {
          this.destinationBalanceBefore = await web3.eth.getBalance(this.destination);
          this.serviceBalanceBefore = await web3.eth.getBalance(this.serviceAddress);

          this.nonce = await this.multisigVaultETH.getNonce.call(
            this.destination,
            this.amount // 1 ETH
          );

          this.tx2 = await this.multisigVaultETH.approve(
            this.destination,
            this.amount, // 1 ETH
            { from: this.party2 }
          )
        });

        it('not have balance', async function () {
          const escrowBalance = await web3.eth.getBalance(this.multisigVaultETH.address);
          assert.equal(escrowBalance, 0);
        });

        it('should emit logs', async function () {
          assert.equal(this.tx2.receipt.status, true);
          assert.equal(this.tx2.logs[0].event, "ConfirmationReceived", "ConfirmationReceived event not emitted");
          assert.equal(this.tx2.logs[1].event, "ConsensusAchived", "ConsensusAchived event not emitted");
        });

        it('should tell about approval', async function () {
          const approval = await this.multisigVaultETH.partyCoincieded.call(
            this.destination,
            this.amount, // 1 ETH
            this.nonce,
            this.party2
          );
          assert.ok(approval);
        });

        it('should not tell about approval with missing nonce', async function () {
          const approval = await this.multisigVaultETH.partyCoincieded.call(
            this.destination,
            this.amount, // 1 ETH
            0,
            this.party2
          );
          assert.ok(!approval);
        });

        it('should tell about approval', async function () {
          const destinationBalanceAfter = await web3.eth.getBalance(this.destination);
          const serviceBalanceAfter = await web3.eth.getBalance(this.serviceAddress);

          const destinationBalanceChanged = destinationBalanceAfter - this.destinationBalanceBefore;
          const serviceBalanceChanged = serviceBalanceAfter - this.serviceBalanceBefore;

          assert.equal(destinationBalanceChanged, (1-this.percent)*ETHER);
          assert.equal(serviceBalanceChanged, this.percent*ETHER);
        });
      });

      describe('party2 regress', function () {
        it('not allowed', async function () {
          await assertRevert(
            this.multisigVaultETH.regress(
              this.destination,
              this.amount, // 1 ETH
              { from: this.party2 }
            )
          );
        });
      });
    });

    describe('party1 regress', function () {
      beforeEach(async function () {
        this.tx = await this.multisigVaultETH.regress(
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
        const escrowBalance = await web3.eth.getBalance(this.multisigVaultETH.address);
        assert.equal(escrowBalance, 1*ETHER);
      });

      it('should tell about approval', async function () {
        const nonce = await this.multisigVaultETH.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce > 0);

        const approval = await this.multisigVaultETH.partyCoincieded.call(
          this.destination,
          this.amount, // 1 ETH
          nonce,
          this.party1
        );
        assert.ok(approval);
      });

      it('should change nonce', async function () {
        const nonce1 = await this.multisigVaultETH.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce1 > 0);

        await this.multisigVaultETH.approve(
          this.destination,
          this.amount, // 1 ETH
          { from: this.party2 }
        )

        const nonce2 = await this.multisigVaultETH.getNonce.call(
          this.destination,
          this.amount // 1 ETH
        );

        assert.ok(nonce2 == 0);
      });


      describe('party2 approved', function () {
        beforeEach(async function () {
          this.destinationBalanceBefore = await web3.eth.getBalance(this.destination);
          this.serviceBalanceBefore = await web3.eth.getBalance(this.serviceAddress);

          this.nonce = await this.multisigVaultETH.getNonce.call(
            this.destination,
            this.amount // 1 ETH
          );

          this.tx2 = await this.multisigVaultETH.approve(
            this.destination,
            this.amount, // 1 ETH
            { from: this.party2 }
          )
        });

        it('not have balance', async function () {
          const escrowBalance = await web3.eth.getBalance(this.multisigVaultETH.address);
          assert.equal(escrowBalance, 0);
        });

        it('should emit logs', async function () {
          assert.equal(this.tx2.receipt.status, true);
          assert.equal(this.tx2.logs[0].event, "ConfirmationReceived", "ConfirmationReceived event not emitted");
          assert.equal(this.tx2.logs[1].event, "ConsensusAchived", "ConsensusAchived event not emitted");
        });

        it('should tell about approval', async function () {
          const approval = await this.multisigVaultETH.partyCoincieded.call(
            this.destination,
            this.amount, // 1 ETH
            this.nonce,
            this.party2
          );
          assert.ok(approval);
        });

        it('should not tell about approval with missing nonce', async function () {
          const approval = await this.multisigVaultETH.partyCoincieded.call(
            this.destination,
            this.amount, // 1 ETH
            0,
            this.party2
          );
          assert.ok(!approval);
        });

        it('should tell about approval', async function () {
          const destinationBalanceAfter = await web3.eth.getBalance(this.destination);
          const serviceBalanceAfter = await web3.eth.getBalance(this.serviceAddress);

          const destinationBalanceChanged = destinationBalanceAfter - this.destinationBalanceBefore;
          const serviceBalanceChanged = serviceBalanceAfter - this.serviceBalanceBefore;

          assert.equal(destinationBalanceChanged, ETHER);
          assert.equal(serviceBalanceChanged, 0);
        });
      });
    });
  });
})

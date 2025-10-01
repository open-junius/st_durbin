
import { ethers } from "ethers";
// import { before, beforeEach, describe, it, after } from "mocha";

// Import the SaintDurbin contract ABI and bytecode
const SaintDurbinArtifact = require("../../out/SaintDurbin.sol/SaintDurbin.json");
// import { ethersWalletFromPrivateKey, generateRandomEthersWallet } from "../../subtensor_chain/evm-tests/src/utils";
import { TypedApi } from "polkadot-api/dist";
import { devnet } from "../../subtensor_chain/evm-tests/.papi/descriptors/dist";
import { blake2AsU8a, decodeAddress } from "@polkadot/util-crypto";
// import { getRandomSubstrateKeypair } from "../../subtensor_chain/evm-tests/src/substrate";
// import { convertH160ToPublicKey } from "../../subtensor_chain/evm-tests/src/address-utils";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { hexToU8a } from "@polkadot/util";
import { getPolkadotSigner } from "polkadot-api/signer";
import { randomBytes } from "crypto";
import {
    DEV_PHRASE,
    entropyToMiniSecret,
    KeyPair,
    mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";

const RPC_URL = "http://localhost:9944";

export function convertH160ToPublicKey(ethAddress: string) {
    const prefix = "evm:";
    const prefixBytes = new TextEncoder().encode(prefix);
    const addressBytes = hexToU8a(
        ethAddress.startsWith("0x") ? ethAddress : `0x${ethAddress}`,
    );
    const combined = new Uint8Array(prefixBytes.length + addressBytes.length);

    // Concatenate prefix and Ethereum address
    combined.set(prefixBytes);
    combined.set(addressBytes, prefixBytes.length);

    // Hash the combined data (the public key)
    const hash = blake2AsU8a(combined);
    return hash;
}

export function generateRandomEthersWallet() {
    const account = ethers.Wallet.createRandom();
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    const wallet = new ethers.Wallet(account.privateKey, provider);
    return wallet;
}

export function ethersWalletFromPrivateKey() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    const wallet = new ethers.Wallet("0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133", provider);
    return wallet;
}


export function getRandomSubstrateSigner() {
    const keypair = getRandomSubstrateKeypair();
    return getSignerFromKeypair(keypair);
}

export function getSignerFromKeypair(keypair: KeyPair) {
    const polkadotSigner = getPolkadotSigner(
        keypair.publicKey,
        "Sr25519",
        keypair.sign,
    );
    return polkadotSigner;
}

export function getRandomSubstrateKeypair() {
    const seed = randomBytes(32);
    const miniSecret = entropyToMiniSecret(seed);
    const derive = sr25519CreateDerive(miniSecret);
    const hdkdKeyPair = derive("");

    return hdkdKeyPair;
}

async function deploy() {
    let api: TypedApi<typeof devnet>; // TypedApi from polkadot-api
    let provider: ethers.JsonRpcProvider;
    let signer: ethers.Wallet;
    let invalidSender: ethers.Wallet;
    let netuid = 64;
    let stakeContract: ethers.Contract;
    let metagraphContract: ethers.Contract;
    // Test accounts
    const emergencyOperator = ethersWalletFromPrivateKey();
    const validator1Hotkey = getRandomSubstrateKeypair();
    const validator1Coldkey = getRandomSubstrateKeypair();

    // 5 validators
    const validatorHotkeys = [
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
    ];
    const validatorColdkeys = [
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
        getRandomSubstrateKeypair(),
    ];

    const contractColdkey = getRandomSubstrateKeypair();
    const drainWallet = generateRandomEthersWallet();
    const drainSs58Publickey = convertH160ToPublicKey(drainWallet.address);

    // used to add stake after coldkey swap
    invalidSender = generateRandomEthersWallet();

    // Recipients for testing
    const recipients: { keypair: any; proportion: number }[] = [];
    for (let i = 0; i < 16; i++) {
        recipients.push({
            keypair: getRandomSubstrateKeypair(),
            proportion: 625, // 6.25% each
        });
    }

    let saintDurbin: any; // Using any to avoid type issues with contract deployment

    // Connect to local subtensor chain
    provider = new ethers.JsonRpcProvider("http://127.0.0.1:9944");
    signer = emergencyOperator.connect(provider);
    invalidSender = invalidSender.connect(provider);

    // stakeContract = new ethers.Contract(
    //     ISTAKING_V2_ADDRESS,
    //     IStakingV2ABI,
    //     signer,
    // );

    // metagraphContract = new ethers.Contract(
    //     IMETAGRAPH_ADDRESS,
    //     IMetagraphABI,
    //     signer,
    // );

    // Initialize substrate API
    // api = await getDevnetApi();
    // await disableWhiteListCheck(api, true);

    // Get validator1 UID
    const validator1Uid = 1;
    const recipientColdkeys = recipients.map((r) => r.keypair.publicKey);
    const proportions = recipients.map((r) => r.proportion);

    // Deploy SaintDurbin
    const factory = new ethers.ContractFactory(
        SaintDurbinArtifact.abi,
        SaintDurbinArtifact.bytecode.object,
        signer,
    );

    saintDurbin = await factory.deploy(
        emergencyOperator.address,
        drainWallet.address,
        drainSs58Publickey,
        validator1Hotkey.publicKey,
        validator1Uid,
        contractColdkey.publicKey,
        netuid,
        recipientColdkeys,
        proportions,
    );

    await saintDurbin.waitForDeployment();
    const contractAddress = await saintDurbin.getAddress();
    console.log(`SaintDurbin deployed at: ${contractAddress}`);
    // Verify deployment
    // expect(await saintDurbin.emergencyOperator()).to.equal(
    //     emergencyOperator.address,
    // );
    // expect(await saintDurbin.currentValidatorHotkey()).to.equal(
    //     u8aToHex(validator1Hotkey.publicKey),
    // );
    // expect(await saintDurbin.netuid()).to.equal(BigInt(netuid));
    // expect(await saintDurbin.getRecipientCount()).to.equal(BigInt(16));
    // // Check initial balance
    // const stakedBalance = await saintDurbin.getStakedBalance();
    // expect(stakedBalance).to.be.gt(0);
}

deploy().catch(console.error);
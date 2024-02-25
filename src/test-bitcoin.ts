import * as btc from "bitcoinjs-lib"
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { redeemScript, SigSet, IbcDest, encode, toNetwork } from ".";
import { sha256 } from "bitcoinjs-lib/src/crypto";
import ECPairFactory from 'ecpair';
import { toASM } from "bitcoinjs-lib/src/script";
import { witnessStackToScriptWitness } from "./witness_stack_to_script_witness";
import { broadcast } from "./blockstream_utils";

const makeSigsets = (xprivs: string[], voting_powers: number[], index: number, network: btc.networks.Network): SigSet => {
    const bip32 = BIP32Factory(ecc);
    let signatories = [] as Array<{ voting_power: number; pubkey: number[] }>;
    for (let i = 0; i < xprivs.length; i++) {
        let xpriv = xprivs[i];
        const node = bip32.fromBase58(xpriv, network);
        const pubkey = node.derive(index).publicKey;
        signatories = [...signatories, {
            pubkey: Array.from(pubkey),
            voting_power: voting_powers[i]
        }]
    }
    return {
        signatories,
        index,
        bridgeFeeRate: 0,
        depositsEnabled: true,
        minerFeeRate: 0,
        threshold: [9,10]
    } as SigSet;
}

const main = async () => {
    const xprivs = ["tprv8ZgxMBicQKsPdk95xiZzD8EpKc1699Q7TqCpAJevpzdxeD4s9pgXyEq8E7DW7X4htC5s4GcFG41Gr5mhjwLzHHuqfU7aedDbEiUvcyd5CcW"]
    const voting_powers = [10000000000];
    const network = btc.networks.testnet;
    const sigsets = makeSigsets(xprivs, voting_powers, 0, network);
    const ibcDest: IbcDest = {
        memo: "",
        receiver: "orai1rchnkdpsxzhquu63y6r4j4t57pnc9w8ehdhedx",
        sender: "oraibtc1rchnkdpsxzhquu63y6r4j4t57pnc9w8ea88hue",
        sourceChannel: "channel-0",
        sourcePort: "transfer",
        timeoutTimestamp: 1709276400000000000n 
    }
    const script = redeemScript(sigsets, sha256(encode(ibcDest)));

    let data = btc.payments.p2wsh({
        redeem: { output: script, redeemVersion: 0 },
        network: toNetwork("testnet"),
    })
    console.log(`Address: ${data.address}\nHash: ${data.hash?.toString("hex")}, Output: ${data.output?.toString("hex")}\nAsm script: ${toASM(data.redeem?.output as Buffer)}`);
    console.log("=======================================")
    console.log(`Script in hex: ${script.toString("hex")}\n`)

    const spendAmountInSats = 20000;
    const withdrawAmountInSats = 5000;
    const feeForTransactionInSats = 1000;

    const psbt = new btc.Psbt({
        network: btc.networks.testnet
    })
    psbt.addInput({
        hash: "8f194c3ad8757da20b1e3cb12575629ffb2933c3be033b3aeec53beb7ef72acf",
        index: 1,
        witnessUtxo: {
            script: data.output!,
            value: spendAmountInSats
        },
        witnessScript: script
    })
    psbt.addOutput({
        address: "tb1q80yacawds7fs9spcn7e6c050vprgu5e8lw83p5",
        value: withdrawAmountInSats,
    });
    // add redundant amount back to previous address
    psbt.addOutput({
        address: data.address!,
        value: spendAmountInSats - withdrawAmountInSats - feeForTransactionInSats,
    });
    const bip32 = BIP32Factory(ecc);
    for (const xpriv of xprivs) {
        const node = bip32.fromBase58(xpriv, btc.networks.testnet);
        psbt.signInput(0, node.derive(0))
    }
    psbt.finalizeInput(0, (inputIndex: number, psbtInput: any) => {
        console.log(psbtInput)
        console.log("Input", psbtInput.partialSig.map((item: any) => item.signature)[0])
        const redeemPayment = btc.payments.p2wsh({
            redeem: {
                input: btc.script.compile(psbtInput.partialSig.map((item: any) => item.signature)),
                output: psbtInput.witnessScript
            }
        });
        const finalScriptWitness = witnessStackToScriptWitness(
            redeemPayment.witness ?? []
        );

        return {
            finalScriptSig: Buffer.from(""),
            finalScriptWitness: finalScriptWitness
        }
    });

    const tx = psbt.extractTransaction();
    console.log(`Broadcasting Transaction Hex: ${tx.toHex()}`);
    const txid = await broadcast(tx.toHex());
    console.log(`Success! Txid is ${txid}`);

}

main();

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
    const xprivs = [""]
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

    const psbt = new btc.Psbt({
        network: btc.networks.testnet
    })
    psbt.addInput({
        hash: "6ffe6c27beff6c6d1504ec099b3a56c823291e09d883e211ca75a4dd67844eea",
        index: 0,
        witnessUtxo: {
            script: data.output!,
            value: 10000
        },
        witnessScript: script
    })
    psbt.addOutput({
        address: "tb1qewgfymc9ssrszh7dh202rtsgz3yjzvyyk77vzv",
        value: 5000,
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

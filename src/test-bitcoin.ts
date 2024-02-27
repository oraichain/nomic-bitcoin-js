import * as btc from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";
import {
  redeemScript,
  SigSet,
  IbcDest,
  encode,
  calcIbcTimeoutTimestamp,
  getSigsetRest,
} from ".";
import { sha256 } from "bitcoinjs-lib/src/crypto";
import { toASM } from "bitcoinjs-lib/src/script";
import { witnessStackToScriptWitness } from "./witness_stack_to_script_witness";
import { broadcast } from "./blockstream_utils";
import { assert } from "console";

const makeSigsets = (
  xprivs: string[],
  voting_powers: number[],
  index: number,
  network: btc.networks.Network,
  threshold: [number, number]
): SigSet => {
  const bip32 = BIP32Factory(ecc);
  let signatories = [] as Array<{ voting_power: number; pubkey: number[] }>;
  for (let i = 0; i < xprivs.length; i++) {
    let xpriv = xprivs[i];
    const node = bip32.fromBase58(xpriv, network);
    const pubkey = node.derive(index).publicKey;
    signatories = [
      ...signatories,
      {
        pubkey: Array.from(pubkey),
        voting_power: voting_powers[i],
      },
    ];
  }
  return {
    signatories,
    index,
    bridgeFeeRate: 0,
    depositsEnabled: true,
    minerFeeRate: 0,
    threshold,
  } as SigSet;
};

const possibleHours = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
];

const main = async () => {
  // This is just my test private key on my local machine, not on the server
  // const xprivs = ["tprv8ZgxMBicQKsPdk95xiZzD8EpKc1699Q7TqCpAJevpzdxeD4s9pgXyEq8E7DW7X4htC5s4GcFG41Gr5mhjwLzHHuqfU7aedDbEiUvcyd5CcW"
  const network =
    process.env.NETWORK === "bitcoin"
      ? btc.networks.bitcoin
      : btc.networks.testnet;
  const btcReceiver = process.env.BTC_RECEIVER;
  if (!btcReceiver)
    throw "Must have a bitcoin receiver address to run this script!";

  const xprivs = process.env.XPRIVS?.split(",") as string[];
  let threshold: [number, number] = [2, 3];
  let possibleTimestamps = [1706616000000000000n, 1706619600000000000n];
  // in other cases, we need to replace the address and input hash with other values
  let correctOutputScripts = [
    {
      address: "bc1q7qclstltzgl052rue3lj5xs03fxc04tttaefle58ad0a88ttfn7svp83hx",
      inputTxHash:
        "63236f1c7b8d58fc376cc7643cd3ab5e878a9ffa6fa6763661b5ebb20ef45f4e",
      vout: 10,
    },
    {
      address: "bc1qr9g7884lqddvs5azktf3kwh3q0lqu4y3rvmrt453z37ek9fz4s0s33ce8y",
      inputTxHash:
        "4a66f63968574e7935b56112c27a85a37d2a5d77d9736fcd81300b84f42d64c0",
      vout: 29,
    },
  ];
  // in other cases, we need to replace the sigset index & ibc info, as the pub keys of the sigset are created based on the sigset index
  let correctSigsetIndexes = [6, 7];
  let ibcInfo = {
    receiver: "orai1varcr599506axhv62gdc5wmlqcy905a4723yrc",
    sender: "oraibtc1varcr599506axhv62gdc5wmlqcy905a45qp2j8",
    sourceChannel: "channel-1",
  };
  if (network === btc.networks.testnet) {
    threshold = [9, 10];
    possibleTimestamps = possibleHours.map((item) =>
      calcIbcTimeoutTimestamp(new Date(`2024-02-26T${item}:00:00.000Z`))
    );
    correctOutputScripts = [
      {
        address:
          "tb1qhm20plkgsvpj8wcrc689qtt72pp0tx935pc53xheqwyyymzw5c5q003y0s",
        inputTxHash:
          "33e118f86cc59436ab717681b72f2df0b4f356c24b5feedb0b37dc7ab22ffe4c",
        vout: 0,
      },
    ];
    ibcInfo = {
      receiver: "orai1rchnkdpsxzhquu63y6r4j4t57pnc9w8ehdhedx",
      sender: "oraibtc1rchnkdpsxzhquu63y6r4j4t57pnc9w8ea88hue",
      sourceChannel: "channel-0",
    };
  }
  for (const sigsetIndex of correctSigsetIndexes) {
    const sigsetData = JSON.parse(
      await getSigsetRest(process.env.LCD as string, sigsetIndex)
    );
    const sigset: SigSet = {
      ...sigsetData.sigset,
      signatories: sigsetData.sigset.signatories.map((signatory: any) => ({
        ...signatory,
        pubkey: signatory.pubkey.bytes,
      })),
      threshold,
    };
    const sigsetFromPrivKeys = makeSigsets(
      xprivs,
      sigset.signatories.map((signatory) => signatory.voting_power),
      sigsetIndex,
      network,
      threshold
    );
    // make sure the queried sigset matches with the sigset created by our private keys so that we can spend the script
    // order is important!
    assert(sigset.threshold === sigsetFromPrivKeys.threshold);
    assert(sigset.signatories.length === sigsetFromPrivKeys.signatories.length);
    for (let i = 0; i < sigset.signatories.length; i++) {
      const signatoryFromPriv = sigsetFromPrivKeys.signatories[i];
      const signatory = sigset.signatories[i];
      assert(
        JSON.stringify(signatory.pubkey) ===
          JSON.stringify(signatoryFromPriv.pubkey)
      );
      assert(
        JSON.stringify(signatory.voting_power) ===
          JSON.stringify(signatoryFromPriv.voting_power)
      );
    }

    for (const timestamp of possibleTimestamps) {
      const ibcDest: IbcDest = {
        timeoutTimestamp: timestamp,
        memo: "",
        ...ibcInfo,
        sourcePort: "transfer",
      };
      const script = redeemScript(sigsetFromPrivKeys, sha256(encode(ibcDest)));

      let data = btc.payments.p2wsh({
        redeem: { output: script, redeemVersion: 0 },
        network,
      });
      // console.log(`Address: ${data.address}`);
      // console.log("=======================================");
      // console.log(`Script in hex: ${script.toString("hex")}\n`);
      const correctInputScript = correctOutputScripts.find(
        (output) => output.address === data.address
      );
      if (data.address && correctInputScript) {
        console.log(
          "\nfound it!!!!!",
          data.address,
          correctInputScript.address,
          timestamp
        );
        // FIXME: set the correct sats for 1 BTC here
        const spendAmountInSats = 10 ** 8;
        // FIXME: get valid transaction fees for the mainnet
        const feeForTransactionInSats = 1000;
        const withdrawAmountInSats =
          spendAmountInSats - feeForTransactionInSats;
        console.log("withdraw amount: ", withdrawAmountInSats);
        const remainingAmount =
          spendAmountInSats - withdrawAmountInSats - feeForTransactionInSats;
        console.log("remaining amount: ", remainingAmount);

        const psbt = new btc.Psbt({
          network,
        });
        psbt.addInput({
          hash: correctInputScript.inputTxHash,
          index: correctInputScript.vout,
          witnessUtxo: {
            script: data.output!,
            value: spendAmountInSats,
          },
          witnessScript: script,
        });
        psbt.addOutput({
          address: btcReceiver,
          value: withdrawAmountInSats,
        });
        // add redundant amount back to previous address
        if (remainingAmount > 0) {
          psbt.addOutput({
            address: data.address!,
            value: remainingAmount,
          });
        }
        const bip32 = BIP32Factory(ecc);
        for (const xpriv of xprivs) {
          const node = bip32.fromBase58(xpriv, network);
          psbt.signInput(0, node.derive(sigsetIndex));
        }
        psbt.finalizeInput(0, (inputIndex: number, psbtInput: any) => {
          const redeemPayment = btc.payments.p2wsh({
            /**
             * Nếu như thứ tự tạo redeem_script là
             * pubkey1 OP_CHECKSIG
             * OP_IF
             * ...
             * OP_SWAP
             * pubkey2 OP_CHECKSIG
             * OP_IF
             * ...
             * OP_SWAP
             * pubkey3 OP_CHECKSIG
             * OP_IF
             * ...
             *
             * Thì thứ tự put signature vào input sẽ phải là
             * signature pubkey 3 - index 0
             * signature pubkey 2 - index 1
             * signature pubkey 1 - index 2
             */
            redeem: {
              input: btc.script.compile(
                psbtInput.partialSig
                  .map((item: any) => item.signature)
                  .reverse()
              ), // Make sure to be putted in a correct orders
              output: psbtInput.witnessScript,
            },
          });
          const finalScriptWitness = witnessStackToScriptWitness(
            redeemPayment.witness ?? []
          );

          return {
            finalScriptSig: Buffer.from(""),
            finalScriptWitness: finalScriptWitness,
          };
        });

        const tx = psbt.extractTransaction();
        console.log("\nBtc receiver: ", btcReceiver + "\n");
        console.log(`Broadcasting Transaction Hex: ${tx.toHex()}`);
        // const txid = await broadcast(tx.toHex());
        // console.log(`Success! Txid is ${txid}`);
      }
    }
  }
};

main();

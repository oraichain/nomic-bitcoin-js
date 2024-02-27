import * as btc from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";
import {
  redeemScript,
  SigSet,
  IbcDest,
  encode,
  toNetwork,
  calcIbcTimeoutTimestamp,
} from ".";
import { sha256 } from "bitcoinjs-lib/src/crypto";
import ECPairFactory from "ecpair";
import { toASM } from "bitcoinjs-lib/src/script";
import { witnessStackToScriptWitness } from "./witness_stack_to_script_witness";
import { broadcast } from "./blockstream_utils";
import { exit } from "process";

const makeSigsets = (
  xprivs: string[],
  voting_powers: number[],
  index: number,
  network: btc.networks.Network,
  threshold: [number, number],
  pubkeys?: number[][]
): SigSet => {
  if (pubkeys) {
    return {
      signatories: pubkeys.map((pk, i) => ({
        pubkey: pk,
        voting_power: voting_powers[i],
      })),
      index,
      bridgeFeeRate: 0,
      depositsEnabled: true,
      minerFeeRate: 0,
      threshold,
    };
  }
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

function permuteAll(arr: string[]): string[][] {
  const permutations: string[][] = [];
  const stack: [string[], number][] = [[[], 0]];

  while (stack.length > 0) {
    const [currentPermutation, index] = stack.pop()!;

    if (index === arr.length) {
      permutations.push(currentPermutation.slice()); // Deep copy to avoid mutation
      continue;
    }

    for (let i = 0; i < arr.length; i++) {
      if (!currentPermutation.includes(arr[i])) {
        const nextPermutation = currentPermutation.slice(); // Deep copy
        nextPermutation.push(arr[i]);
        stack.push([nextPermutation, index + 1]);
      }
    }
  }

  return permutations;
}

function permuteWithoutElement(
  arr: string[],
  elementToRemove: string
): string[][] {
  const permutations: string[][] = [];
  if (arr.length === 1) {
    return [[arr[0]]];
  }

  for (let i = 0; i < arr.length; i++) {
    const currentElement = arr[i];
    // Skip the element to remove
    if (currentElement === elementToRemove) {
      continue;
    }

    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const subPermutations = permuteWithoutElement(remaining, elementToRemove);

    // Add the current element to the beginning of each sub-permutation
    subPermutations.forEach((permutation) => {
      permutations.push([currentElement, ...permutation]);
    });
  }

  return permutations;
}

function permuteAllWithoutElement(arr: string[]): string[][] {
  const allPermutations: string[][] = [];
  arr.forEach((elementToRemove) => {
    const remaining = arr.slice();
    remaining.splice(remaining.indexOf(elementToRemove), 1);
    const permutations = permuteWithoutElement(remaining, elementToRemove);
    allPermutations.push(...permutations);
  });
  return allPermutations;
}

const main = async () => {
  // This is just my test private key on my local machine, not on the server
  // const xprivs = ["tprv8ZgxMBicQKsPdk95xiZzD8EpKc1699Q7TqCpAJevpzdxeD4s9pgXyEq8E7DW7X4htC5s4GcFG41Gr5mhjwLzHHuqfU7aedDbEiUvcyd5CcW"
  const network =
    process.env.NETWORK === "bitcoin"
      ? btc.networks.bitcoin
      : btc.networks.testnet;
  const initialXprivs = process.env.XPRIVS?.split(",") as string[];
  const xprivsPermut = permuteAll(initialXprivs);
  const threshold: [number, number] =
    network === btc.networks.testnet ? [9, 10] : [2, 3];
  const votingPower = network === btc.networks.testnet ? 10000000000 : 10;
  const sigsetMaxIndex = 16;
  const possibleTimestamps =
    network === btc.networks.testnet
      ? possibleHours.map((item) =>
          calcIbcTimeoutTimestamp(new Date(`2024-02-26T${item}:00:00.000Z`))
        )
      : [1706616000000000000n, 1706619600000000000n];
  const correctOutputScripts =
    network === btc.networks.testnet
      ? ["tb1qhm20plkgsvpj8wcrc689qtt72pp0tx935pc53xheqwyyymzw5c5q003y0s"]
      : [
          "bc1qr9g7884lqddvs5azktf3kwh3q0lqu4y3rvmrt453z37ek9fz4s0s33ce8y",
          "bc1q7qclstltzgl052rue3lj5xs03fxc04tttaefle58ad0a88ttfn7svp83hx",
        ];
  const ibcInfo = btc.networks.testnet
    ? {
        receiver: "orai1rchnkdpsxzhquu63y6r4j4t57pnc9w8ehdhedx",
        sender: "oraibtc1rchnkdpsxzhquu63y6r4j4t57pnc9w8ea88hue",
        sourceChannel: "channel-0",
      }
    : {
        receiver: "orai1varcr599506axhv62gdc5wmlqcy905a4723yrc",
        sender: "oraibtc1varcr599506axhv62gdc5wmlqcy905a45qp2j8",
        sourceChannel: "channel-1",
      };

  for (const xprivs of xprivsPermut) {
    for (let i = 0; i < sigsetMaxIndex; i++) {
      for (const timestamp of possibleTimestamps) {
        const voting_powers = xprivs.map((x) => votingPower);
        const sigsetIndex = i;
        const sigsets = makeSigsets(
          xprivs,
          voting_powers,
          sigsetIndex,
          network,
          threshold,
          network === btc.networks.testnet
            ? [
                [
                  3, 151, 122, 98, 185, 145, 105, 5, 19, 86, 154, 149, 100, 93,
                  38, 223, 56, 209, 80, 143, 161, 46, 66, 7, 111, 146, 78, 139,
                  150, 206, 230, 162, 94,
                ],
                [
                  2, 79, 99, 98, 117, 17, 27, 176, 162, 102, 108, 56, 14, 190,
                  233, 53, 197, 140, 151, 228, 65, 142, 97, 75, 74, 75, 242,
                  206, 109, 198, 201, 193, 145,
                ],
              ]
            : undefined
        );
        const ibcDest: IbcDest = {
          timeoutTimestamp: timestamp,
          memo: "",
          ...ibcInfo,
          sourcePort: "transfer",
        };
        const script = redeemScript(sigsets, sha256(encode(ibcDest)));

        let data = btc.payments.p2wsh({
          redeem: { output: script, redeemVersion: 0 },
          network,
        });
        console.log(
          `Address: ${data.address}\nHash: ${data.hash?.toString(
            "hex"
          )}, Output: ${data.output?.toString("hex")}\nAsm script: ${toASM(
            data.redeem?.output as Buffer
          )}`
        );
        // console.log("=======================================");
        // console.log(`Script in hex: ${script.toString("hex")}\n`);
        if (data.address && correctOutputScripts.includes(data.address)) {
          console.log("found it!!!!!", data.address);
          exit(0);
        }
      }
    }
  }

  //   const spendAmountInSats = 10000;
  //   const withdrawAmountInSats = 9000;
  //   const feeForTransactionInSats = 1000;

  //   const psbt = new btc.Psbt({
  //     network: btc.networks.testnet,
  //   });
  //   psbt.addInput({
  //     hash: "33e118f86cc59436ab717681b72f2df0b4f356c24b5feedb0b37dc7ab22ffe4c",
  //     index: 0,
  //     witnessUtxo: {
  //       script: data.output!,
  //       value: spendAmountInSats,
  //     },
  //     witnessScript: script,
  //   });
  //   psbt.addOutput({
  //     address: "tb1q80yacawds7fs9spcn7e6c050vprgu5e8lw83p5",
  //     value: withdrawAmountInSats,
  //   });
  //   // add redundant amount back to previous address
  //   psbt.addOutput({
  //     address: data.address!,
  //     value: spendAmountInSats - withdrawAmountInSats - feeForTransactionInSats,
  //   });
  //   const bip32 = BIP32Factory(ecc);
  //   for (const xpriv of xprivs) {
  //     const node = bip32.fromBase58(xpriv, btc.networks.testnet);
  //     psbt.signInput(0, node.derive(sigsetIndex));
  //   }
  //   psbt.finalizeInput(0, (inputIndex: number, psbtInput: any) => {
  //     const redeemPayment = btc.payments.p2wsh({
  //       /**
  //        * Nếu như thứ tự tạo redeem_script là
  //        * pubkey1 OP_CHECKSIG
  //        * OP_IF
  //        * ...
  //        * OP_SWAP
  //        * pubkey2 OP_CHECKSIG
  //        * OP_IF
  //        * ...
  //        * OP_SWAP
  //        * pubkey3 OP_CHECKSIG
  //        * OP_IF
  //        * ...
  //        *
  //        * Thì thứ tự put signature vào input sẽ phải là
  //        * signature pubkey 3 - index 0
  //        * signature pubkey 2 - index 1
  //        * signature pubkey 1 - index 2
  //        */
  //       redeem: {
  //         input: btc.script.compile(
  //           psbtInput.partialSig.map((item: any) => item.signature).reverse()
  //         ), // Make sure to be putted in a correct orders
  //         output: psbtInput.witnessScript,
  //       },
  //     });
  //     const finalScriptWitness = witnessStackToScriptWitness(
  //       redeemPayment.witness ?? []
  //     );

  //     return {
  //       finalScriptSig: Buffer.from(""),
  //       finalScriptWitness: finalScriptWitness,
  //     };
  //   });

  //   const tx = psbt.extractTransaction();
  //   console.log(`Broadcasting Transaction Hex: ${tx.toHex()}`);
  //   const txid = await broadcast(tx.toHex());
  //   console.log(`Success! Txid is ${txid}`);
};

main();

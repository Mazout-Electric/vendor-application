import BleManager from 'react-native-ble-manager';
const elliptic = require('elliptic');
const { Buffer } = require('buffer');
import { AUTH_SERVICE_UUID, BROD_SG_CHAR_UUID, BROD_SN_CHAR_UUID, CHAL_CHAR_UUID, SIG_CHAR_UUID } from "./BleConstants";

// Convert public key array to hex string with '04' prefix
const publicKeyArray = [
    0x9F, 0xE8, 0xB8, 0xFA, 0x1F, 0x60, 0xBC, 0x61, 0x44, 0x7A, 0x57, 0x5E, 0x6B, 0xDA, 0xDE,
    0xC9, 0xE7, 0x9B, 0x0E, 0xBF, 0x60, 0xE6, 0x0A, 0x27, 0xA6, 0xBA, 0x9A, 0x1C, 0xAA, 0x60,
    0xBE, 0x03, 0x68, 0x13, 0xBC, 0xD3, 0x28, 0x6A, 0x2D, 0x3E, 0x65, 0xC5, 0xF6, 0x61, 0x61,
    0x31, 0x1C, 0x4A, 0x1E, 0x57, 0x69, 0x42, 0xF7, 0xEA, 0x8E, 0x46, 0xC2, 0xF3, 0x16, 0xAB,
    0xDB, 0x25, 0x0A, 0xC8
];
const publicKeyHex = Buffer.from([0x04, ...publicKeyArray]).toString('hex'); // Add '04' prefix for uncompressed format

const ec = new elliptic.ec('p256');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Utility function to convert byte array to hex string
const byteToString = (bytes) => {
    return Buffer.from(bytes).toString('hex');
};

// Generate a random challenge
const generateRandomChallenge = (size = 32) => {
    return Array.from({ length: size }, () => Math.floor(Math.random() * 256));
};

// Verify the signature using public key and challenge
const verifySignature = (signatureArray, challengeHex) => {
    try {
        const r = Buffer.from(signatureArray.slice(0, 32)).toString('hex');
        const s = Buffer.from(signatureArray.slice(32)).toString('hex');
        const key = ec.keyFromPublic(publicKeyHex, 'hex');
        const signature = { r, s };
        const verified = key.verify(challengeHex, signature);
        console.log('Signature verified:', verified);
        return verified;
    } catch (error) {
        console.error('Error verifying signature:', error);
        return false;
    }
};

export const authenticateDevice = async (device) => {
    try {
        // Connect to the device
        await BleManager.connect(device.id);
        console.log('Connected to device:', device.id);

        // Retrieve services and characteristics
        const services = await BleManager.retrieveServices(device.id);
        console.log('Services retrieved:', services);
        const characteristics = services.characteristics;

        let serialNumberArray = [];
        let signatureArray = [];
        const CHAL_CHAR_UUID = '2b04'; // Ensure to replace with the actual UUID if needed

        // Step 1: Read Serial Number and Signature
        for (const characteristic of characteristics) {
            if (characteristic.service === AUTH_SERVICE_UUID) {
                if (characteristic.characteristic === BROD_SN_CHAR_UUID) {
                    const value = await BleManager.read(device.id, AUTH_SERVICE_UUID, BROD_SN_CHAR_UUID);
                    serialNumberArray = value;
                    console.log(`Read from ${BROD_SN_CHAR_UUID}:`, byteToString(value));
                } else if (characteristic.characteristic === BROD_SG_CHAR_UUID) {
                    const value = await BleManager.read(device.id, AUTH_SERVICE_UUID, BROD_SG_CHAR_UUID);
                    signatureArray = value;
                    console.log(`Read from ${BROD_SG_CHAR_UUID}:`, byteToString(value));
                }
            }
        }

        // Verify the signature
        if (serialNumberArray.length && signatureArray.length) {
            const challengeHex = byteToString(serialNumberArray);
            const verified = verifySignature(signatureArray, challengeHex);
            console.log('Initial SIgnature Verification Status:', verified ? 'Success' : 'Failure');

            if (!verified) {
                throw new Error('Initial signature verification failed');
            }
        } else {
            throw new Error('Failed to read serial number or signature');
        }

        // Step 2: Write Random Challenge
        const randomChallenge = generateRandomChallenge(32);
        const chunkSize = 4;

        for (let i = 0; i < randomChallenge.length; i += chunkSize) {
            const chunk = randomChallenge.slice(i, i + chunkSize);
            try {
                await BleManager.write(device.id, AUTH_SERVICE_UUID, CHAL_CHAR_UUID, chunk);
                console.log(`Written to ${CHAL_CHAR_UUID} (chunk ${i / chunkSize + 1}):`, byteToString(chunk));
            } catch (error) {
                console.log(`Error writing to ${CHAL_CHAR_UUID}`, error);
            }
        }

        // Read back the random challenge
        try {
            const readBackValue = await BleManager.read(device.id, AUTH_SERVICE_UUID, CHAL_CHAR_UUID);
            console.log(`Read back from ${CHAL_CHAR_UUID}:`, byteToString(readBackValue));
        } catch (error) {
            console.log(`Error reading back from ${CHAL_CHAR_UUID}`, error);
        }

        // Add a 2-second delay
        await delay(2000);

        // Step 3: Read the Signature and Hash after Random Challenge
        let finalSignatureArray = [];
        let finalHashArray = [];

        try {
            const finalHashValue = await BleManager.read(device.id, AUTH_SERVICE_UUID, BROD_SN_CHAR_UUID);
            finalHashArray = finalHashValue;
            console.log(`Read again from BROD_SN_CHAR_UUID (2bd9):`, byteToString(finalHashValue));

            const finalSignatureValue = await BleManager.read(device.id, AUTH_SERVICE_UUID, SIG_CHAR_UUID);
            finalSignatureArray = finalSignatureValue;
            console.log(`Read again from SIG_CHAR_UUID (2b88):`, byteToString(finalSignatureValue));
        } catch (error) {
            console.log(`Error reading SIG_CHAR_UUID or BROD_SN_CHAR_UUID`, error);
        }
        // After reading finalSignatureArray and finalHashArray

        if (finalSignatureArray.length && finalHashArray.length) {
            const finalHashHex = byteToString(finalHashArray);

            const finalVerified = verifySignature(finalSignatureArray, finalHashHex);

            if (finalVerified) {
                console.log('Final Verification Status: Success');
                return true;
            } else {
                console.log('Final Verification Status: Failure');
                return false;
            }
        } else {
            console.error('Final Signature or Hash not available for verification');
            return false;
        }


    } catch (error) {
        console.error('Authentication error:', error);
        return false;
    }
};

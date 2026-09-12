import type { EmailMessage } from '@cloudflare/workers-types';
import type { AddressType, Environment } from '../types';
import { Dao, loadArrayFromRaw } from '../db';

export type AddressCheckStatus = 'white' | 'block' | 'no_match';

/** Match an address against a pattern: exact (case-insensitive) or regular expression. */
export function testAddress(address: string, pattern: string): boolean {
    if (pattern.toLowerCase() === address.toLowerCase()) {
        return true;
    }
    try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(address);
    } catch {
        return false;
    }
}

function matchAddress(list: string[], address: string): boolean {
    for (const item of list) {
        if (item && testAddress(address, item)) {
            return true;
        }
    }
    return false;
}

export interface AddressLists {
    white: string[];
    block: string[];
}

/** Load white/black list patterns from D1, seeded by deployment variables when present. */
export async function loadAddressLists(env: Environment): Promise<AddressLists> {
    const dao = new Dao(env.DB);
    const whiteFromDb = (await dao.listAddresses('white')).map(item => item.address);
    const blockFromDb = (await dao.listAddresses('block')).map(item => item.address);
    const seedWhite = loadArrayFromRaw(env.WHITE_LIST);
    const seedBlock = loadArrayFromRaw(env.BLOCK_LIST);
    return {
        white: [...seedWhite, ...whiteFromDb],
        block: [...seedBlock, ...blockFromDb],
    };
}

export async function checkAddressStatus(addresses: string[], env: Environment): Promise<{ [key: string]: AddressCheckStatus }> {
    const { white, block } = await loadAddressLists(env);
    const result: { [key: string]: AddressCheckStatus } = {};
    for (const addr of addresses) {
        if (!addr) {
            continue;
        }
        if (matchAddress(white, addr)) {
            result[addr] = 'white';
            continue;
        }
        if (matchAddress(block, addr)) {
            result[addr] = 'block';
            continue;
        }
        result[addr] = 'no_match';
    }
    return result;
}

/** White list wins over black list. */
export async function isMessageBlock(message: EmailMessage, env: Environment): Promise<boolean> {
    const res = await checkAddressStatus([message.from, message.to], env);
    for (const key in res) {
        if (res[key] === 'white') {
            return false;
        }
    }
    for (const key in res) {
        if (res[key] === 'block') {
            return true;
        }
    }
    return false;
}

/** Test a single address, returning every matching pattern per list. */
export async function testAddressAgainstLists(address: string, env: Environment): Promise<{
    status: AddressCheckStatus;
    matchedWhite: string[];
    matchedBlock: string[];
}> {
    const { white, block } = await loadAddressLists(env);
    const matchedWhite = white.filter(pattern => pattern && testAddress(address, pattern));
    const matchedBlock = block.filter(pattern => pattern && testAddress(address, pattern));
    let status: AddressCheckStatus = 'no_match';
    if (matchedWhite.length > 0) {
        status = 'white';
    } else if (matchedBlock.length > 0) {
        status = 'block';
    }
    return { status, matchedWhite, matchedBlock };
}

export type { AddressType };

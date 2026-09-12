import { testAddress } from './check';

function expectMatch(address: string, pattern: string, expected: boolean): void {
    const got = testAddress(address, pattern);
    if (got !== expected) {
        throw new Error(`testAddress("${address}", "${pattern}") = ${got}, expected ${expected}`);
    }
}

function testCase() {
    expectMatch('alice@example.com', 'alice@example.com', true);
    expectMatch('alice@example.com', 'ALICE@EXAMPLE.COM', true);
    expectMatch('alice@example.com', '^alice@', true);
    expectMatch('alice@example.com', 'example\\.com$', true);
    expectMatch('alice@example.com', 'bob@example.com', false);
    expectMatch('alice@example.com', 'nomatch@other.com', false);
    // Invalid regex patterns match nothing instead of throwing.
    expectMatch('alice@example.com', '([invalid', false);
    // Wildcard-style regex patterns behave as documented.
    expectMatch('anything@spam.test', '.*@spam\\.test', true);
    console.log('testAddress ok: exact, case-insensitive, regex and invalid-regex behavior');
}

testCase();

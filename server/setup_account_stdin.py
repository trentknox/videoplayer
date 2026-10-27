#!/usr/bin/env python3
"""Create one Vivid account from bounded JSON on stdin; never echo credentials."""
import json
import os
import sqlite3
import sys
from pathlib import Path
from accounts import Accounts

def main():
    try:
        raw = sys.stdin.buffer.read(4097)
        if len(raw) > 4096: raise ValueError('invalid request')
        data = json.loads(raw)
        username, password = data.get('username'), data.get('password')
        if not isinstance(username, str) or not isinstance(password, str): raise ValueError('invalid request')
        account_db = os.environ.get('VIVID_DB_FILE', str(Path.home() / 'vivid-ai-next/accounts.sqlite3'))
        Accounts(account_db).create_account(username, password)
        print('Account created.')
    except (ValueError, TypeError, sqlite3.Error):
        print('Account not created. The name may already be in use or the password may be too short.', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__': raise SystemExit(main())

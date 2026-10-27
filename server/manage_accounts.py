#!/usr/bin/env python3
"""Create a Vivid account locally on the VPS without putting secrets in arguments."""
import getpass
import os
import sqlite3
from pathlib import Path
from accounts import Accounts

def main():
    path = os.environ.get('VIVID_DB_FILE', str(Path.home() / 'vivid-ai-gateway/accounts.sqlite3'))
    username = input('Account name: ').strip()
    password = getpass.getpass('Account passcode (at least 8 characters): ')
    confirm = getpass.getpass('Confirm passcode: ')
    if password != confirm:
        raise SystemExit('Passcodes did not match; no account was created.')
    try:
        Accounts(path).create_account(username, password)
    except (ValueError, sqlite3.IntegrityError):
        raise SystemExit('Invalid credentials or account name already exists.')
    print('Account created.')

if __name__ == '__main__': main()

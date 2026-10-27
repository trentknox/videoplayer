#!/usr/bin/env python3
"""One-time local Vivid account setup. Passwords go to Oracle over SSH stdin."""
import html
import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

HOST = '127.0.0.1'
PORT = 18765
ORIGIN = f'http://{HOST}:{PORT}'
PAGE = '''<!doctype html><html><head><meta charset="utf-8"><title>Set up Vivid</title><style>body{font:16px system-ui;background:#101322;color:#f5f5ff;max-width:560px;margin:7vh auto;padding:20px}input,button{display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 18px;border-radius:8px;border:1px solid #555;background:#20243a;color:white}button{background:#7164e9;cursor:pointer}p{line-height:1.5}</style></head><body><h1>Set up your private Vivid account</h1><p>This form runs only on this computer. Your password is sent to your Oracle server over the existing SSH connection; it is not posted in chat.</p><form method="post" action="/create"><label>Account name<input name="username" required maxlength="100" autocomplete="username"></label><label>Password (at least 8 characters)<input name="password" type="password" required minlength="8" maxlength="1024" autocomplete="new-password"></label><label>Confirm password<input name="confirm" type="password" required minlength="8" maxlength="1024" autocomplete="new-password"></label><button>Create account</button></form></body></html>'''

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def send_page(self, status, body):
        data = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if self.path != '/' or self.headers.get('Host') != f'{HOST}:{PORT}': return self.send_page(404, 'Not found')
        self.send_page(200, PAGE)
    def do_POST(self):
        if self.path != '/create' or self.headers.get('Host') != f'{HOST}:{PORT}' or self.headers.get('Origin') != ORIGIN: return self.send_page(403, 'Forbidden')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 8192: raise ValueError('invalid size')
            values = parse_qs(self.rfile.read(length).decode('utf-8'), strict_parsing=True)
            username, password, confirm = (values.get(key, [''])[0] for key in ('username', 'password', 'confirm'))
            if not username.strip() or len(username) > 100 or len(password) < 8 or len(password) > 1024 or password != confirm: raise ValueError('invalid credentials')
            command = ['ssh.exe', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'ccm-stream', 'python3', '/home/ubuntu/vivid-ai-next/setup_account_stdin.py']
            result = subprocess.run(command, input=json.dumps({'username': username, 'password': password}), capture_output=True, text=True, timeout=30, check=False)
            if result.returncode: raise ValueError('The account was not created. The name may already be in use or the server may be unavailable.')
            self.send_page(200, '<h1>Account created</h1><p>Return to Vivid, open Settings, and connect using this account name and password. When Edge asks, allow local-network access for Vivid.</p>')
            threading.Thread(target=self.server.shutdown, daemon=True).start()
        except (ValueError, UnicodeError, OSError, subprocess.TimeoutExpired) as error:
            message = str(error) if str(error).startswith('The account') else 'Check the account name and matching passwords, then try again.'
            self.send_page(400, f'<p>{html.escape(message)}</p><a href="/">Try again</a>')

if __name__ == '__main__':
    server = HTTPServer((HOST, PORT), Handler)
    timer = threading.Timer(1200, server.shutdown)
    timer.daemon = True
    timer.start()
    try: server.serve_forever()
    finally: timer.cancel(); server.server_close()

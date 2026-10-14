"""Yerel geliştirme sunucusu (önbelleksiz). Kullanım: python3 kayit-asistani/tools/dev_server.py 8766
Kök dizin: kayit-asistani/. Yalnızca 127.0.0.1'de dinler."""
import http.server, os, sys, functools

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()
    def log_message(self, *a):
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCache, directory=root)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()

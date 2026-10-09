# Wraps ../fitness-tracker.html (written for the Artifact viewer) into a standalone page for hosting.
import pathlib
here = pathlib.Path(__file__).parent
src = (here.parent / "fitness-tracker.html").read_text()
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style>'
        '</head><body>')
(here / "index.html").write_text(head + src + "</body></html>")

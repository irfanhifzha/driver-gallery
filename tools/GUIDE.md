Common runs

```
# try it on tools/media_input with the example fixture
python tools/apply_edits.py tools/drive-gallery-edits-example.json
 
# real export: ids -> filenames
python tools/apply_edits.py ~/Downloads/drive-gallery-edits-2026-11-17.json photos/ out/ --map map.json
 
# one look on everything, lossless
python tools/apply_edits.py edits.json --all-with DSC_0075 --format .png
 
# smaller batch
python tools/apply_edits.py edits.json --size 1600 --quality 88
 
# preview without writing
python tools/apply_edits.py edits.json --dry-run
```

Match rule: without  --map , an entry is used when its key equals a file's name without extension ( DSC_0060  ↔  DSC_0060.JPG ). Outputs are named after the input stem in the out folder; unmatched photos are reported as "skipped".
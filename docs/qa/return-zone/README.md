# Return zone QA output (#309, PR #335)

Raw output, unedited, from a Ryzen 7 5700X with an RTX 3070 under WSL2 on 15 Nov 2026.

- `bench-node.txt`: `node scripts/bench-return-zone.mjs`, the first sortie's moments on the real HiRISE tile in Node.
- `gpu-with-zone-0653.txt` and `gpu-baseline-0656.txt`: `QA_GPU=1 node scripts/qa-return-zone.mjs`, then the same with
  `--baseline` (`?zone=off`), at 06:53 and 06:56 PST. This version of the script did not log the load average.
- `gpu-with-zone.txt` and `gpu-baseline.txt`: the same pair at 07:14 and 07:17 PST, with the load average in
  `loadStart` and `loadEnd`. Other Chrome sessions on the machine pushed the load from 1.6 to 5.8 during the pair.

Screenshots from the 06:53 run are on the `qa-assets/return-zone` branch, kept out of `main`.

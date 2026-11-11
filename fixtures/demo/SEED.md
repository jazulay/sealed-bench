# Demo seed (public, not secret)

The mock rehearsal suites were generated with a published seed, so anyone can regenerate them and confirm the on-chain roots:

    seed = sha256("sealed-bench public demo seed v1 (not secret)") = 6ab8130a44e0c527100a75bf383df99d9282f6f5518f9556a9dc528646ee8a18

    node cli/src/cli.ts gen --suite demo-mock-sealed-v1 --seed 6ab8130a44e0c527100a75bf383df99d9282f6f5518f9556a9dc528646ee8a18 --dir /tmp/sb-sealed
    # root: 2445da5762846ec77ba1c90c4c310ef18bb81e4756f227299dbb1fa032e9dfcb
    node cli/src/cli.ts gen --suite demo-mock-public-v1 --kind public --seed 6ab8130a44e0c527100a75bf383df99d9282f6f5518f9556a9dc528646ee8a18 --dir /tmp/sb-public
    # root: fdc76754a4ede041da91fd4f3476d6e04f27824c1cb9c354efa53be6512a0eaa

Real sealed suites use a fresh random seed that stays secret; only challenged items are ever revealed.

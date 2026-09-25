#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/../.."

# tools/ec4/ec4_setup.py edits an EC4 "all setups" dump that the user then
# flashes. A wrong byte there is not a test failure on a bench, it is a
# reflashed controller with fifteen setups the user did not ask to change --
# so the two properties that matter are pinned here with a synthetic dump
# (the factory file is Faderfox's, not ours to vendor):
#   1. the writer and the reader agree, CRCs and padding included, and an
#      unmodified dump round-trips byte for byte
#   2. writing setup N touches setup N's bytes and nothing else

python3 - <<'EOF'
import random, sys
sys.path.insert(0, 'tools/ec4')
import ec4_setup as m

fails = 0
def check(ok, what):
    global fails
    if not ok:
        print('FAIL: ' + what)
        fails += 1

rng = random.Random(4)
image = bytearray(m.MEM_HI)
for a in range(m.MEM_LO, m.MEM_HI):
    image[a] = rng.randrange(256)
header = [(0x41, m.DEVICE_ID), (0x42, 0x03), (0x43, 0x02), (0x44, 0x00)]

dump = m.build_dump(header, image)
h2, img2 = m.parse_dump(dump)
check(h2 == header, 'header survives a round trip')
check(img2[m.MEM_LO:] == image[m.MEM_LO:], 'image survives a round trip')
check(m.build_dump(h2, img2) == dump, 'rebuild is byte-identical')

# every data byte goes out as 0x4D 0x2h 0x1l; one bad nibble must be caught
bad = bytearray(dump)
i = bad.index(0x4D)
bad[i + 2] ^= 0x01
try:
    m.parse_dump(bytes(bad))
    check(False, 'a flipped data nibble fails the page CRC')
except m.DumpError:
    pass

for slot in (0, 13, 15):
    edited = bytearray(image)
    m.write_schwung_setup(edited, slot, 0)
    regions = [
        (m.ADDR_KEY1 + slot * 256, m.ADDR_KEY1 + (slot + 1) * 256),
        (m.ADDR_SETUP_NAMES + slot * 4, m.ADDR_SETUP_NAMES + (slot + 1) * 4),
        (m.ADDR_GROUP_NAMES + slot * 64, m.ADDR_GROUP_NAMES + (slot + 1) * 64),
        (m.ADDR_SETUP_DATA + slot * 3072, m.ADDR_SETUP_DATA + (slot + 1) * 3072),
        (m.ADDR_KEY2 + slot * 512, m.ADDR_KEY2 + (slot + 1) * 512),
    ]
    outside = [a for a in range(m.MEM_LO, m.MEM_HI)
               if edited[a] != image[a] and not any(lo <= a < hi for lo, hi in regions)]
    check(not outside, 'setup %d edit stays inside setup %d (%d stray bytes)'
          % (slot + 1, slot + 1, len(outside)))

# the map the E16 decoder already reads: CC 1-16 relative, notes 0-15
edited = bytearray(image)
m.write_schwung_setup(edited, 15, 0)
for g in (0, 15):
    base = m.group_base(15, g)
    k1 = m.ADDR_KEY1 + (15 * 16 + g) * m.KEY1_GROUP_LEN
    for e in range(16):
        check(edited[base + e] == 0x00, 'g%d e%d is CCR1 on channel 1' % (g, e))
        check(edited[base + 16 + e] == e + 1, 'g%d e%d sends CC %d' % (g, e, e + 1))
        check(edited[base + 112 + e] == 0x10, 'g%d push %d is a note on channel 1' % (g, e))
        check(edited[k1 + e] == e, 'g%d push %d is momentary note %d' % (g, e, e))

try:
    m.name4('A_B')
    check(False, 'names outside the EC4 character set are refused')
except ValueError:
    pass

sys.exit(1 if fails else 0)
EOF
status=$?
[ $status -eq 0 ] && echo "PASS: test_ec4_setup"
exit $status

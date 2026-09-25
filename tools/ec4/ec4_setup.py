#!/usr/bin/env python3
"""Write a Schwung setup into a Faderfox EC4 "all setups" dump.

The EC4 has no remote mode: what an encoder sends is whatever the loaded
setup says. So Schwung gets a fixed input map the same way the E16 does in
remote mode, by shipping the setup that produces it.

The format is the one the device writes when you dump "all setups", documented
by privatepublic-de/faderfox-editor (doc/faderfox sysex data format EC4 V2.txt
and faderfox sysex format general.txt): one SysEx, every byte sent as three
wire bytes (command 0x4X, MSB nibble 0x2X, LSB nibble 0x1X), memory in 64-byte
pages each closed by a 16-bit sum and 30 zero bytes.

It edits a dump rather than building one from nothing, so the other fifteen
setups on the device survive: dump yours first, or start from the factory
file in faderfox-editor (ec4-v2/EC4-setup-all-factory-V20.syx).

    python3 ec4_setup.py IN.syx OUT.syx --slot 13            # write the setup
    python3 ec4_setup.py IN.syx OUT.syx --slot 13 --channel 1
    python3 ec4_setup.py IN.syx --show 13                    # print a setup

The Schwung setup, per group, mirrors the E16's remote-mode map so the E16
decoder reads it unchanged:

    encoder 1-16   CC 1-16, relative mode 1 (1 / 127), no acceleration
    push 1-16      note 0-15, momentary
    all 16 groups  identical; group names G01..G16, encoder names '----'

The encoder names are '----' on purpose. The EC4 manual (V03, Ableton Live
Setups) says of Faderfox's own script: "You can use this script with setups
13...16. Set encoder names to '----' else the script can't write the names."
So a named encoder is not host-writable; use --slot 13 or 14 (15 and 16 hold
the factory Ableton setups).

Identical groups means the group a CC came from is NOT in the CC. The manual
says group and setup selects are reported as SysEx ("Special fixed commands"),
which is what would tell the host the page; the bytes are not documented
there, so this setup is the probe for them, not the final layout.

Sending the result writes all 16 setups. Send it with the faderfox-editor web
app or any SysEx tool; slow send rates are safer (the device flashes each page).
"""
import argparse
import sys

DEVICE_ID = 0x0B          # EC4, per faderfox sysex format general.txt
MEM_LO = 0x0B00           # first address the dump carries
MEM_HI = 0x10000          # one past the last
PAGE = 64
PADDING = 30              # zero bytes after every page ("important for flash")

ADDR_KEY1 = 0x0B00        # 16 setups x 16 groups x 16 bytes
ADDR_SETUP_NAMES = 0x1BC0 # 16 setups x 4 chars
ADDR_GROUP_NAMES = 0x1C00 # 16 setups x 16 groups x 4 chars
ADDR_SETUP_DATA = 0x2000  # 16 setups x 16 groups x 192 bytes
ADDR_KEY2 = 0xE000        # 16 setups x 16 groups x 32 bytes

GROUP_LEN = 192
KEY1_GROUP_LEN = 16
KEY2_GROUP_LEN = 32

# encoder types (high nibble of byte 0..15 of a group)
ENC_CCR1 = 0              # relative, 1 / 127
# encoder modes (high nibble of byte 80..95)
MODE_ACC0 = 3             # no acceleration
# display scales (low nibble of byte 80..95)
SCALE_OFF = 0
# push button types (high nibble of byte 112..127)
PB_NOTE = 1

ENC_TYPES = ['CCR1', 'CCR2', 'CCab', 'PrgC', 'CCAh', 'PBnd', 'AftT', 'Note', 'NRPN']
PB_TYPES = ['Off', 'Note', 'CC', 'PrgC', 'PBnd', 'AftT', 'Grp', 'Set',
            'Acc0', 'Acc3', 'LSp6', 'Min', 'Max']

NAME_CHARS = set(b'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                 b'abcdefghijklmnopqrstuvwxyz ./-')


class DumpError(Exception):
    pass


def nibbles(v):
    return [0x20 | (v >> 4), 0x10 | (v & 0x0F)]


def decode_commands(data):
    """Wire bytes -> [(cmd, value)]. F0/F7, the 00 00 00 manufacturer bytes
    and the page padding are not commands and are skipped."""
    out = []
    i = 0
    n = len(data)
    while i < n:
        b = data[i]
        if b >> 4 == 0x4:
            if i + 2 >= n or data[i + 1] >> 4 != 0x2 or data[i + 2] >> 4 != 0x1:
                raise DumpError('malformed command at byte %d' % i)
            out.append((b, ((data[i + 1] & 0x0F) << 4) | (data[i + 2] & 0x0F)))
            i += 3
        elif b in (0xF0, 0xF7, 0x00):
            i += 1
        else:
            raise DumpError('unexpected byte 0x%02X at %d' % (b, i))
    return out


def parse_dump(data):
    """-> (header, image). header is the (cmd, value) list before the first
    page, kept so the output claims the same firmware as the input. image is
    a bytearray indexed by EC4 address; every page CRC is checked."""
    if not data or data[0] != 0xF0 or data[-1] != 0xF7 or data[1:4] != b'\x00\x00\x00':
        raise DumpError('not a Faderfox SysEx dump')
    cmds = decode_commands(data)
    header = []
    image = bytearray(MEM_HI)
    seen = set()
    addr = None
    crc = 0
    count = 0
    started = False
    for cmd, v in cmds:
        if cmd == 0x49:
            started = True
            addr = v << 8
            crc = 0
            count = 0
        elif cmd == 0x4A:
            addr |= v
            if addr % PAGE or not MEM_LO <= addr < MEM_HI:
                raise DumpError('page address 0x%04X out of range' % addr)
            page_addr = addr
        elif cmd == 0x4D:
            if count >= PAGE:
                raise DumpError('page 0x%04X longer than %d bytes' % (page_addr, PAGE))
            image[page_addr + count] = v
            crc += v
            count += 1
        elif cmd == 0x4B:
            want = v << 8
        elif cmd == 0x4C:
            want |= v
            if want != crc & 0xFFFF:
                raise DumpError('CRC mismatch on page 0x%04X' % page_addr)
            if count != PAGE:
                raise DumpError('page 0x%04X has %d bytes' % (page_addr, count))
            seen.add(page_addr)
        elif cmd == 0x4F:
            if v != DEVICE_ID:
                raise DumpError('dump is for device 0x%02X, not the EC4' % v)
        elif not started:
            header.append((cmd, v))
        else:
            raise DumpError('unexpected command 0x%02X inside the pages' % cmd)
    if dict(header).get(0x41) != DEVICE_ID:
        raise DumpError('dump is not from an EC4')
    if dict(header).get(0x42) != 0x03:
        raise DumpError('need an "all setups" dump (download type 3), got %r'
                        % dict(header).get(0x42))
    missing = [a for a in range(MEM_LO, MEM_HI, PAGE) if a not in seen]
    if missing:
        raise DumpError('%d pages missing, first 0x%04X' % (len(missing), missing[0]))
    return header, image


def build_dump(header, image):
    out = [0xF0, 0x00, 0x00, 0x00]
    for cmd, v in header:
        out += [cmd] + nibbles(v)
    for addr in range(MEM_LO, MEM_HI, PAGE):
        out += [0x49] + nibbles(addr >> 8)
        out += [0x4A] + nibbles(addr & 0xFF)
        crc = 0
        for v in image[addr:addr + PAGE]:
            out += [0x4D] + nibbles(v)
            crc += v
        crc &= 0xFFFF
        out += [0x4B] + nibbles(crc >> 8)
        out += [0x4C] + nibbles(crc & 0xFF)
        out += [0x00] * PADDING
    out += [0x4F] + nibbles(DEVICE_ID) + [0xF7]
    return bytes(out)


def name4(text):
    raw = text.encode('ascii')[:4].ljust(4, b' ')
    bad = [chr(c) for c in raw if c not in NAME_CHARS]
    if bad:
        raise ValueError('EC4 names allow 0-9 A-Z a-z space . / -; got %r' % ''.join(bad))
    return raw


def group_base(setup, group):
    return ADDR_SETUP_DATA + (setup * 16 + group) * GROUP_LEN


def write_schwung_setup(image, setup, channel, name='SCHW'):
    """setup and channel are 0-based. Leaves every other setup untouched."""
    ch = channel & 0x0F
    image[ADDR_SETUP_NAMES + setup * 4:ADDR_SETUP_NAMES + setup * 4 + 4] = name4(name)
    for g in range(16):
        gn = ADDR_GROUP_NAMES + (setup * 16 + g) * 4
        image[gn:gn + 4] = name4('G%02d' % (g + 1))
        base = group_base(setup, g)
        k1 = ADDR_KEY1 + (setup * 16 + g) * KEY1_GROUP_LEN
        k2 = ADDR_KEY2 + (setup * 16 + g) * KEY2_GROUP_LEN
        for e in range(16):
            image[base + e] = (ENC_CCR1 << 4) | ch          # type + channel
            image[base + 16 + e] = 1 + e                    # no link, CC 1-16
            image[base + 32 + e] = 0                        # NRPN MSB, unused
            image[base + 48 + e] = 0                        # lower (unused for CCR1)
            image[base + 64 + e] = 127                      # upper (unused for CCR1)
            image[base + 80 + e] = (MODE_ACC0 << 4) | SCALE_OFF
            image[base + 96 + e] = 0                        # lower/upper MSBs
            image[base + 112 + e] = (PB_NOTE << 4) | ch     # push: note, channel
            n = base + 128 + e * 4
            image[n:n + 4] = name4('----')                  # host-writable, see below
            image[k1 + e] = e                               # key mode 0, note 0-15
            image[k2 + e] = 0                               # no display, lower 0
            image[k2 + 16 + e] = 127                        # no link, upper 127


def describe_setup(image, setup):
    s = setup
    lines = ['setup %d "%s"' % (s + 1, image[ADDR_SETUP_NAMES + s * 4:][:4].decode('latin1'))]
    for g in range(16):
        base = group_base(s, g)
        gn = ADDR_GROUP_NAMES + (s * 16 + g) * 4
        k1 = ADDR_KEY1 + (s * 16 + g) * KEY1_GROUP_LEN
        cells = []
        for e in range(16):
            t = image[base + e] >> 4
            pbt = image[base + 112 + e] >> 4
            cells.append('%s:%s ch%d #%d | %s ch%d #%d' % (
                image[base + 128 + e * 4:][:4].decode('latin1'),
                ENC_TYPES[t] if t < len(ENC_TYPES) else t,
                (image[base + e] & 15) + 1, image[base + 16 + e] & 0x7F,
                PB_TYPES[pbt] if pbt < len(PB_TYPES) else pbt,
                (image[base + 112 + e] & 15) + 1, image[k1 + e] & 0x7F))
        lines.append('  group %d "%s"' % (g + 1, image[gn:gn + 4].decode('latin1')))
        lines += ['    ' + c for c in cells]
    return '\n'.join(lines)


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('input', help='an EC4 "all setups" dump (.syx)')
    ap.add_argument('output', nargs='?', help='where to write the edited dump')
    ap.add_argument('--slot', type=int, help='setup to overwrite, 1-16')
    ap.add_argument('--channel', type=int, default=1, help='MIDI channel 1-16 (default 1)')
    ap.add_argument('--name', default='SCHW', help='setup name, 4 chars (default SCHW)')
    ap.add_argument('--show', type=int, metavar='SETUP', help='print setup 1-16 and exit')
    args = ap.parse_args(argv)

    with open(args.input, 'rb') as f:
        header, image = parse_dump(f.read())

    if args.show:
        if not 1 <= args.show <= 16:
            ap.error('--show takes 1-16')
        print(describe_setup(image, args.show - 1))
        return 0
    if not args.output or not args.slot:
        ap.error('writing needs OUTPUT and --slot')
    if not 1 <= args.slot <= 16:
        ap.error('--slot takes 1-16')
    if not 1 <= args.channel <= 16:
        ap.error('--channel takes 1-16')

    write_schwung_setup(image, args.slot - 1, args.channel - 1, args.name)
    out = build_dump(header, image)
    parse_dump(out)  # the writer must satisfy the reader, CRCs included
    with open(args.output, 'wb') as f:
        f.write(out)
    print('wrote %s: setup %d = "%s", channel %d, %d bytes'
          % (args.output, args.slot, args.name, args.channel, len(out)))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except (DumpError, ValueError) as e:
        sys.exit('ec4_setup: %s' % e)

#!/usr/bin/env python3
"""Probe a Faderfox EC4 from a computer: the control for the Move-side probe.

A computer is a known-good USB-MIDI host, so this answers "does the EC4 do
what the two reference implementations say" on its own. If it works here and
the ec4-probe tool on Move shows nothing, the difference is Move's USB-A port
(docs/E16_REMOTE.md, "The USB-A limitation"), not the protocol.

    python3 ec4_probe.py                    # list MIDI ports -- count the EC4's
    python3 ec4_probe.py EC4                # run the sequence, then monitor 30 s
    python3 ec4_probe.py EC4 --seconds 120  # monitor longer

The sequence, each step printed as it goes:
  1. request setup/group             expect a reply naming the current setup
  2. write "SCHW" into encoder 1     expect it on screen (the encoder's stored
                                     name must be '----')
  3. write all 16 names in one message
  4. show a 4x20 overlay for 3 s, then hide it
  5. put the names back to '----'
Then it monitors: change group or setup, press Shift, FUNC + encoder 1/5/9/13
(user keys), Shift + push, and turn encoders. Every inbound message is printed
raw and decoded.

Bytes match src/shared/ec4_protocol.mjs (and its sources); that file is the
one to correct when the bench disagrees.

Needs python-rtmidi (pip install python-rtmidi).
"""
import argparse
import sys
import time

try:
    import rtmidi
except ImportError:
    sys.exit('needs python-rtmidi: pip install python-rtmidi')

HEADER = [0xF0, 0x00, 0x00, 0x00, 0x4E, 0x2C, 0x1B]


def nib(v):
    return [0x20 | (v >> 4), 0x10 | (v & 0x0F)]


def text_msg(page, offset, text, show=False):
    out = HEADER + [0x4E, 0x22, 0x10 | page, 0x4A] + nib(offset)
    for ch in text:
        c = ord(ch)
        out += [0x4D] + nib(c if 0x20 <= c < 0x7F and ch not in '$@[\\]_' else 0x1F)
    if show:
        out += [0x4E, 0x22, 0x14]
    return out + [0xF7]


QUERY = [0xF0, 0x00, 0x00, 0x00, 0x4E, 0x20, 0x10, 0xF7]
HIDE_TOTAL = HEADER + [0x4E, 0x22, 0x15, 0xF7]


def hexs(b):
    return ' '.join('%02x' % x for x in b)


def decode(msg):
    if msg[:7] != HEADER or msg[-1] != 0xF7:
        return None
    body = msg[7:-1]
    out = []
    ext = shifted = -1
    for i in range(0, len(body) - len(body) % 3, 3):
        cmd, func, val = body[i:i + 3]
        if cmd != 0x4E or val & 0xF0 != 0x10:
            out.append('unknown %s' % hexs(body[i:i + 3]))
            continue
        v = val & 0x0F
        if func == 0x28:
            out.append('setup %d' % (v + 1))
        elif func == 0x24:
            out.append('group %d' % (v + 1))
        elif func == 0x26:
            ext = v
        elif func == 0x2A:
            shifted = v
        elif func == 0x2E:
            state = 'down' if v == 1 else 'up'
            if shifted >= 0:
                out.append('shift+push %d %s' % (shifted + 1, state))
            elif ext == 1:
                out.append('shift %s' % state)
            elif 2 <= ext <= 5:
                out.append('user %d %s' % (ext - 1, state))
            else:
                out.append('key state %s (key unknown)' % state)
        else:
            out.append('unknown %s' % hexs(body[i:i + 3]))
    if len(body) % 3:
        out.append('trailing %s' % hexs(body[-(len(body) % 3):]))
    return out


def describe(msg):
    st = msg[0] & 0xF0
    ch = (msg[0] & 0x0F) + 1
    if msg[0] == 0xF0:
        d = decode(msg)
        return ('EC4: ' + ', '.join(d)) if d is not None else 'other SysEx'
    if st == 0xB0:
        v = msg[2]
        return 'CC %d ch%d value %d (relative %+d)' % (msg[1], ch, v, v if v < 64 else v - 128)
    if st in (0x80, 0x90):
        return 'note %d ch%d %s' % (msg[1], ch, 'on' if st == 0x90 and msg[2] else 'off')
    return ''


def list_ports():
    mi, mo = rtmidi.MidiIn(), rtmidi.MidiOut()
    print('inputs:')
    for i, n in enumerate(mi.get_ports()):
        print('  %d  %s' % (i, n))
    print('outputs:')
    for i, n in enumerate(mo.get_ports()):
        print('  %d  %s' % (i, n))
    print('\nHow many of these belong to the EC4? One in + one out is the case that\n'
          'can work over Move\'s USB-A; more predicts no SysEx there.')


def open_port(cls, match):
    p = cls()
    names = p.get_ports()
    hits = [i for i, n in enumerate(names) if match.lower() in n.lower()]
    if not hits:
        sys.exit('no %s port matching %r in %r' % ('input' if cls is rtmidi.MidiIn else 'output', match, names))
    if len(hits) > 1:
        print('note: %d ports match %r, using %r' % (len(hits), match, names[hits[0]]))
    p.open_port(hits[0])
    return p, names[hits[0]]


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('port', nargs='?', help='substring of the EC4 port name')
    ap.add_argument('--seconds', type=float, default=30, help='monitor time after the sequence')
    args = ap.parse_args(argv)
    if not args.port:
        list_ports()
        return 0

    mi, in_name = open_port(rtmidi.MidiIn, args.port)
    mo, out_name = open_port(rtmidi.MidiOut, args.port)
    mi.ignore_types(sysex=False, timing=True, active_sense=True)
    print('in:  %s\nout: %s\n' % (in_name, out_name))

    t0 = time.monotonic()
    seen = {'ec4': 0}

    def on_msg(event, _):
        msg, _dt = event
        d = describe(msg)
        if msg and msg[0] == 0xF0 and d.startswith('EC4'):
            seen['ec4'] += 1
        print('  %7.3f  <- %s   %s' % (time.monotonic() - t0, hexs(msg), d))

    mi.set_callback(on_msg)

    def send(what, msg, wait):
        print('%7.3f  -> %s (%d bytes, %d packets)\n          %s'
              % (time.monotonic() - t0, what, len(msg), (len(msg) + 2) // 3, hexs(msg)))
        mo.send_message(msg)
        time.sleep(wait)

    send('1. request setup/group', QUERY, 1.0)
    print('   reply seen: %s\n' % ('YES' if seen['ec4'] else 'NO -- inbound SysEx or the request is not working'))
    send('2. name of encoder 1 = SCHW', text_msg(0, 0, 'SCHW'), 2.0)
    names = ''.join('N%02d ' % (i + 1) for i in range(16))
    send('3. all 16 names, one message', text_msg(0, 0, names), 2.0)
    overlay = 'SCHWUNG EC4 PROBE   ' + 'from a computer     ' + 'row 3: 0123456789   ' + 'row 4: abcdefghij   '
    send('4. overlay, shown', text_msg(3, 0, overlay, show=True), 3.0)
    send('   overlay hidden', HIDE_TOTAL, 1.0)
    send('5. names back to ----', text_msg(0, 0, '-' * 64), 1.0)

    print('\nmonitoring %.0f s: change group/setup, press Shift, FUNC+enc 1/5/9/13, '
          'Shift+push, turn encoders\n' % args.seconds)
    try:
        time.sleep(args.seconds)
    except KeyboardInterrupt:
        pass
    mi.close_port()
    mo.close_port()
    print('\nEC4 SysEx messages received: %d' % seen['ec4'])
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

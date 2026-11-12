# Security

Vow's sandbox (`--sandbox`, `--allow`) is designed to limit what a program can reach: the network, files and environment variables. If you find a way for a Vow program to get past those limits, or any other security problem, please report it privately through GitHub's "Report a vulnerability" button on this repository's Security tab rather than opening a public issue. You can also email vowlang@proton.me.

`--allow fs=DIR` allows both reading and writing inside `DIR`. `--allow fs-read=DIR` allows reading only: a program that calls `writeFile` or `appendFile` is refused before it runs.

The browser playground runs entirely in your browser. Network, file and environment calls there always return an error, and nothing you type is sent anywhere.

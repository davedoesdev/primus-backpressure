/**
# primus-backpressure&nbsp;&nbsp;&nbsp;[![Build Status](https://travis-ci.org/davedoesdev/primus-backpressure.png)](https://travis-ci.org/davedoesdev/primus-backpressure) [![Coverage Status](https://coveralls.io/repos/davedoesdev/primus-backpressure/badge.png?branch=master)](https://coveralls.io/r/davedoesdev/primus-backpressure?branch=master) [![NPM version](https://badge.fury.io/js/primus-backpressure.png)](http://badge.fury.io/js/primus-backpressure)

Node [streams2](http://nodejs.org/api/stream.html) over [Primus](https://github.com/primus/primus): added back-pressure!

- Pass in a Primus client or spark, get back a [`stream.Duplex`](http://nodejs.org/api/stream.html#stream_class_stream_duplex_1). Do this on both sides of a Primus connection.
- [`write`](http://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback) returns `true` when the receiver is full.
- Use [`read`](http://nodejs.org/api/stream.html#stream_readable_read_size) and [`readable`](http://nodejs.org/api/stream.html#stream_event_readable) to exert back-pressure on the sender.
- Unit tests with 100% coverage.
- Browser unit tests using [webpack](http://webpack.github.io/) and [PhantomJS](http://phantomjs.org/).

The API is described [here](#api).

## Example

Exerting backpressure over Primus:

```javascript
var Primus = require('primus'),
    PrimusDuplex = require('..').PrimusDuplex,
    primus = Primus.createServer({ port: 9000 }),
    Socket = primus.Socket,
    assert = require('assert'),
    read_a = false;

primus.once('connection', function (spark)
{
    var spark_duplex = new PrimusDuplex(spark,
    {
        initiate_handshake: true,
        highWaterMark: 2
    });

    assert.equal(spark_duplex.write('ab'), false);

    spark_duplex.on('drain', function ()
    {
        assert(read_a);
    });
});

var client_duplex = new PrimusDuplex(new Socket('http://localhost:9000'),
{
    highWaterMark: 1
});

client_duplex.once('readable', function ()
{
    assert.equal(this.read().toString(), 'a');
    read_a = true;
    assert.equal(this.read(), null);

    this.once('readable', function ()
    {
        assert.equal(this.read().toString(), 'b');
        primus.end();
        console.log('done')
    });
});
```

## Another Example

Piping data over Primus:

```javascript
var Primus = require('primus'),
    PrimusDuplex = require('..').PrimusDuplex,
    primus = Primus.createServer({ port: 9000 }),
    Socket = primus.Socket,
    assert = require('assert'),
    crypto = require('crypto'),
    tmp = require('tmp'),
    fs = require('fs');

primus.once('connection', function (spark)
{
    var spark_duplex = new PrimusDuplex(spark,
    {
        initiate_handshake: true
    });

    tmp.tmpName(function (err, random_file)
    {
        assert.ifError(err);

        var random_buf = crypto.randomBytes(1024 * 1024);

        fs.writeFile(random_file, random_buf, function (err)
        {
            assert.ifError(err);

            tmp.tmpName(function (err, out_file)
            {
                assert.ifError(err);

                var random_stream = fs.createReadStream(random_file),
                    out_stream = fs.createWriteStream(out_file);

                out_stream.on('finish', function ()
                {
                    fs.readFile(out_file, function (err, out_buf)
                    {
                        assert.ifError(err);
                        assert.deepEqual(out_buf, random_buf);

                        fs.unlink(random_file, function (err)
                        {
                            assert.ifError(err);
                            fs.unlink(out_file, function (err)
                            {
                                assert.ifError(err);
                                primus.end();
                                console.log('done');
                            });
                        });
                    });
                });

                spark_duplex.pipe(out_stream);
                random_stream.pipe(spark_duplex);
            });
        });
    });
});

var client_duplex = new PrimusDuplex(new Socket('http://localhost:9000'));
client_duplex.pipe(client_duplex);
```

## Installation

```shell
npm install primus-backpressure
```

## Licence

[MIT](LICENCE)

## Test

Node client to Node server:

```shell
grunt test
```

Browser client to Node server (requires [PhantomJS](http://phantomjs.org/)):

```shell
grunt test-browser
```

## Code Coverage

```shell
grunt coverage
```

[Instanbul](http://gotwarlost.github.io/istanbul/) results are available [here](http://githubraw.herokuapp.com/davedoesdev/primus-backpressure/master/coverage/lcov-report/index.html).

Coveralls page is [here](https://coveralls.io/r/davedoesdev/primus-backpressure).

## Lint

```shell
grunt lint
```

# API

[`PrimusDuplex`](#primusduplexmsg_stream-options) inherits from [`stream.Duplex`](http://nodejs.org/api/stream.html#stream_class_stream_duplex_1) so you can call any method from [`stream.Readable`](http://nodejs.org/api/stream.html#stream_class_stream_readable) and [`stream.Writable`](http://nodejs.org/api/stream.html#stream_class_stream_writable).

Extra constructor options, an additional parameter to [`readable.read`](http://nodejs.org/api/stream.html#stream_readable_read_size) and an extra event are described below.
*/
/*jslint node: true, nomen: true, unparam: true */

"use strict";

var util = require('util'),
    stream = require('stream'),
    crypto = require('crypto');

/**
Creates a new `PrimusDuplex` object which exerts back-pressure over a [Primus](https://github.com/primus/primus) connection.

Both sides of a Primus connection must use `PrimusDuplex` &mdash; create one for your Primus client and one for your spark as soon as you have them.

@constructor
@extends stream.Duplex

@param {Object} msg_stream The Primus client or spark you wish to exert back-pressure over.

@param {Object} [options] Configuration options. This is passed onto `stream.Duplex` and can contain the following extra properties:

  - `{Boolean} [initiate_handshake]` Whether to send a handshake message to the other side of the connection. `PrimusDuplex` needs to exchange a handshake message so both sides know how much data the other can initially buffer. You should pass `initiate_handshake` as `true` on _one side only after connection has been established_. The simplest way to do this is on the server as soon as Primus emits a `connection` event. Defaults to `false`.

  - `{Function} [encode_data(chunk, encoding, start, end)]` Optional encoding function for data passed to [`writable.write`](http://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback). `chunk` and `encoding` are as described in the `writable.write` documentation. The difference is that `encode_data` is synchronous (it must return the encoded data) and it should only encode data between the `start` and `end` positions in `chunk`. Defaults to a function which does `chunk.toString('base64', start, end)`.

  - `{Function} [decode_data(chunk)]` Optional decoding function for data received on the Primus connection. The type of `chunk` will depend on how the peer `PrimusDuplex` encoded it. Defaults to a functon which does `new Buffer(chunk, 'base64')`.

  - `{Integer} [max_write_size]` Maximum number of bytes to write onto the Primus connection at once, regardless of how many bytes the peer is free to receive. Defaults to 0 (no limit).

  - `{Boolean} [check_read_overflow]` Whether to check if more data than expected is being received. If `true` and the high-water mark for reading is exceeded then the `PrimusDuplex` object emits an `error` event. This should not normally occur unless you add data yourself using [`readable.unshift`](http://nodejs.org/api/stream.html#stream_readable_unshift_chunk) &mdash; in which case you should set `check_read_overflow` to `false`. Defaults to `true`.

  - `{Integer} [seq_size]` Number of random bytes to use for sequence numbers. `PrimusDuplex` sends sequence numbers with messages so it knows it has up-to-date information from its peer. The sequence numbers are random so the peer has to read the data to obtain them. It can't guess a sequence number and lie about the amount of space it has free in its buffer in order to get the sender to buffer more data.
  
    Note that if you're worried about a malicious peer using a TCP implementation which doesn't ACK data in order to get the sender to buffer more data, you should consider modifying the TCP parameters in your operating system related to timeout, retransmission limits and keep-alive. On Linux, see the `tcp(7)` man page.
*/
function PrimusDuplex(msg_stream, options)
{
    stream.Duplex.call(this, options);

    options = options || {};

    this._seq_size = options.seq_size || 20;
    this._max_write_size = options.max_write_size || 0;
    this._check_read_overflow = options.check_read_overflow !== false;
    this._msg_stream = msg_stream;
    this._seq = crypto.randomBytes(this._seq_size).toString('base64');
    this._remote_free = 0;
    this._data = null;
    this._encoding = null;
    this._index = 0;
    this._handshake_sent = false;
    this._finished = false;

    this._encode_data = options.encode_data || function (chunk, encoding, start, end)
    {
        return chunk.toString('base64', start, end);
    };

    this._decode_data = options.decode_data || function (chunk)
    {
        return new Buffer(chunk, 'base64');
    };

    var ths = this;

    msg_stream.once('data', function (data)
    {
        if (data.type === 'end')
        {
            ths.push(null);
            return ths._msg_stream.end();
        }

        if (data.type !== 'handshake')
        {
            return ths.emit('error', new Error('expected handshake, got: ' + data.type));
        }

        ths._remote_free = ths._max_write_size > 0 ?
                Math.min(data.free, ths._max_write_size) : data.free;

        if (!ths._handshake_sent)
        {
            ths._send_handshake();
        }

        msg_stream.on('data', function (data)
        {
            if (data.type === 'data')
            {
                ths._remote_seq = data.seq;

                // work around https://github.com/primus/primus/issues/263
                /* istanbul ignore else */
                if (!ths._readableState.ended)
                {
                    var ddata = ths._decode_data(data.data);

                    if (ths._check_read_overflow &&
                        ((ths._readableState.length + ddata.length) >
                         ths._readableState.highWaterMark))
                    {
                        ths.emit('error', new Error('too much data'));
                    }
                    else
                    {
                        ths.push(ddata);
                    }
                }
            }
            else if (data.type === 'status')
            {
                if (data.seq === ths._seq)
                {
                    ths._remote_free = ths._max_write_size > 0 ?
                            Math.min(data.free, ths._max_write_size) : data.free;
                    ths._send();
                }
            }
            else if (data.type === 'end')
            {
                ths.push(null);

                if (ths._finished)
                {
                    ths._msg_stream.end();
                }
            }
            else
            {
                ths.emit('error', new Error('unknown type: ' + data.type));
            }
        });

        ths._send();
    });

    this.on('finish', function ()
    {
        this._finished = true;

        if (this.allowHalfOpen)
        {
            this._msg_stream.write(
            {
                type: 'end'
            });
        }
        else
        {
            this._msg_stream.end();
        }
    });

    this._msg_stream.on('end', function ()
    {
        ths.push(null);

        if (ths.allowHalfOpen)
        {
            // primus streams can't be half open
            ths.end();
        }
    });

    this._msg_stream.on('error', function (err)
    {
        ths.emit('error', err);
    });

    if (options.initiate_handshake)
    {
        this._send_handshake();
    }
}

util.inherits(PrimusDuplex, stream.Duplex);

PrimusDuplex.prototype._send_handshake = function ()
{
    this._handshake_sent = true;

    this._msg_stream.write(
    {
        type: 'handshake',
        free: this._readableState.highWaterMark - this._readableState.length
    });
};

PrimusDuplex.prototype._send_status = function ()
{
    // Note: Status messages are sent regardless of remote_free
    // (if the remote peer isn't doing anything it could never be sent and it
    // could be waiting for a status update). 
    // This means every time the app calls read(), a status message wlll be sent
    // to the remote peer. If you want to control when status messages are
    // sent then use the second parameter of read(), send_status.
    // To force sending a status message without actually reading any data,
    // call read(0).

    if (this._remote_seq === undefined)
    {
        return;
    }

    var free = this._readableState.highWaterMark - this._readableState.length,
        msg;

    if (this._prev_status &&
        (this._prev_status.free === free) &&
        (this._prev_status.seq === this._remote_seq))
    {
        return;
    }

    msg = {
        type: 'status',
        free: free,
        seq: this._remote_seq
    };

    this._prev_status = msg;
    this._msg_stream.write(msg);
};

PrimusDuplex.prototype._read = function () { return undefined; };

/**
See [`readable.read`](http://nodejs.org/api/stream.html#stream_readable_read_size). `PrimusDuplex` adds an extra optional parameter, `send_status`.

@param {Number} [size] Optional argument to specify how much data to read. Defaults to `undefined` (you can also specify `null`) which means return all the data available.

@param {Boolean} [send_status] Every time you call `read`, a status message is sent to the peer `PrimusDuplex` indicating how much space is left in the internal buffer to receive new data. To prevent deadlock, these status messages are always sent &mdash; they aren't subject to back-pressure. Normally this is fine because status messages are small. However, if your application reads data one byte at a time, for example, you may wish to control when status messages are sent. To stop a status message being sent when you call `read`, pass `send_status` as `false`. `send_status` defaults to `true`. To force a status message to be sent without reading any data, call `read(0)`.
*/
PrimusDuplex.prototype.read = function (size, send_status)
{
    var r = stream.Duplex.prototype.read.call(this, size);

    if (send_status !== false)
    {
        this._send_status();
    }

    return r;
};

PrimusDuplex.prototype._send = function ()
{
    if ((this._data === null) ||
        (this._remote_free <= 0))
    {
        return;
    }

    var cb, size = Math.min(this._remote_free, this._data.length - this._index);

    this._seq = crypto.randomBytes(this._seq_size).toString('base64');

    this._msg_stream.write(
    {
        type: 'data',
        data: this._encode_data(this._data, this._encoding, this._index, this._index + size),
        seq: this._seq
    });

    this._remote_free -= size;
    this._index += size;

    if (this._index === this._data.length)
    {
        this._data = null;
        this._encoding = null;
        this._index = 0;
        cb = this._cb;
        this._cb = null;
        cb();
    }
};

PrimusDuplex.prototype._write = function (data, encoding, cb)
{
    this._data = data;
    this._encoding = encoding;
    this._cb = cb;
    this._send();
};

exports.PrimusDuplex = PrimusDuplex;


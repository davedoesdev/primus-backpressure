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
    PrimusDuplex = require('primus-backpressure').PrimusDuplex,
    primus = Primus.createServer({ port: 9000 }),
    Socket = primus.Socket,
    assert = require('assert'),
    read_a = false;

primus.once('connection', function (spark)
{
    var spark_duplex = new PrimusDuplex(spark,
    {
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
    PrimusDuplex = require('primus-backpressure').PrimusDuplex,
    primus = Primus.createServer({ port: 9000 }),
    Socket = primus.Socket,
    assert = require('assert'),
    crypto = require('crypto'),
    tmp = require('tmp'),
    fs = require('fs');

primus.once('connection', function (spark)
{
    var spark_duplex = new PrimusDuplex(spark);

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

[c8](https://github.com/bcoe/c8) results are available [here](http://rawgit.davedoesdev.com/davedoesdev/primus-backpressure/master/coverage/lcov-report/index.html).

Coveralls page is [here](https://coveralls.io/r/davedoesdev/primus-backpressure).

## Lint

```shell
grunt lint
```

# API

[`PrimusDuplex`](#primusduplexmsg_stream-options) inherits from [`stream.Duplex`](http://nodejs.org/api/stream.html#stream_class_stream_duplex_1) so you can call any method from [`stream.Readable`](http://nodejs.org/api/stream.html#stream_class_stream_readable) and [`stream.Writable`](http://nodejs.org/api/stream.html#stream_class_stream_writable).

Extra constructor options and an additional parameter to [`readable.read`](http://nodejs.org/api/stream.html#stream_readable_read_size) are described below.

_Source: [index.js](/index.js)_

<a name="tableofcontents"></a>

- <a name="toc_primusduplexmsg_stream-options"></a>[PrimusDuplex](#primusduplexmsg_stream-options)
- <a name="toc_primusduplexprototypereadsize-send_status"></a><a name="toc_primusduplexprototype"></a>[PrimusDuplex.prototype.read](#primusduplexprototypereadsize-send_status)

## PrimusDuplex(msg_stream, [options])

> Creates a new `PrimusDuplex` object which exerts back-pressure over a [Primus](https://github.com/primus/primus) connection.

Both sides of a Primus connection must use `PrimusDuplex` &mdash; create one for your Primus client and one for your spark as soon as you have them.

**Parameters:**

- `{Object} msg_stream` The Primus client or spark you wish to exert back-pressure over.
- `{Object} [options]` Configuration options. This is passed onto `stream.Duplex` and can contain the following extra properties:
  - `{Function} [encode_data(chunk, encoding, start, end, internal)]` Optional encoding function for data passed to [`writable.write`](http://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback). `chunk` and `encoding` are as described in the `writable.write` documentation. The difference is that `encode_data` is synchronous (it must return the encoded data) and it should only encode data between the `start` and `end` positions in `chunk`. Defaults to a function which does `chunk.toString('base64', start, end)`. Note that `PrimusDuplex` may also pass some internal data through this function (always with `chunk` as a `Buffer`, `encoding=null` and `internal=true`).

  - `{Function} [decode_data(chunk, internal)]` Optional decoding function for data received on the Primus connection. The type of `chunk` will depend on how the peer `PrimusDuplex` encoded it. Defaults to a function which does `Buffer.from(chunk, 'base64')`. If the data can't be decoded, return `null` (and optionally call `this.emit` to emit an error). Note that `PrimusDuplex` may also pass some internal data through this function (always with `internal=true`) &mdash; in which case you must return a `Buffer`.

  - `{Integer} [max_write_size]` Maximum number of bytes to write onto the Primus connection at once, regardless of how many bytes the peer is free to receive. Defaults to 0 (no limit).

  - `{Boolean} [check_read_overflow]` Whether to check if more data than expected is being received. If `true` and the high-water mark for reading is exceeded then the `PrimusDuplex` object emits an `error` event. This should not normally occur unless you add data yourself using [`readable.unshift`](http://nodejs.org/api/stream.html#stream_readable_unshift_chunk) &mdash; in which case you should set `check_read_overflow` to `false`. Defaults to `true`.

<sub>Go: [TOC](#tableofcontents)</sub>

<a name="primusduplexprototype"></a>

## PrimusDuplex.prototype.read([size], [send_status])

> See [`readable.read`](http://nodejs.org/api/stream.html#stream_readable_read_size). `PrimusDuplex` adds an extra optional parameter, `send_status`.

**Parameters:**

- `{Number} [size]` Optional argument to specify how much data to read. Defaults to `undefined` (you can also specify `null`) which means return all the data available.
- `{Boolean} [send_status]` Every time you call `read`, a status message is sent to the peer `PrimusDuplex` indicating how much space is left in the internal buffer to receive new data. To prevent deadlock, these status messages are always sent &mdash; they aren't subject to back-pressure. Normally this is fine because status messages are small. However, if your application reads data one byte at a time, for example, you may wish to control when status messages are sent. To stop a status message being sent when you call `read`, pass `send_status` as `false`. `send_status` defaults to `true`. To force a status message to be sent without reading any data, call `read(0)`.

<sub>Go: [TOC](#tableofcontents) | [PrimusDuplex.prototype](#toc_primusduplexprototype)</sub>

_&mdash;generated by [apidox](https://github.com/codeactual/apidox)&mdash;_

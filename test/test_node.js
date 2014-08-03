/*global describe: false,
         client_duplex: false,
         spark_duplex: false,
         expect: false,
         crypto: false,
         it: false,
         Socket: false,
         PrimusDuplex: false,
         client_url: false,
         fs: false,
         tmp: false,
         random_fname: false,
         primus: false,
         expr: false,
         both: false,
         beforeEach: false,
         afterEach: false,
         drain: false,
         get_server: false,
         connect: false,
         closedown: false */
/*jslint node: true, nomen: true */
"use strict";

function single_byte(get_sender, get_recipient)
{
    return function (cb)
    {
        // once because we don't care about readable emitted when we push null
        get_recipient().once('readable', function ()
        {
            expect(this.read().toString()).to.equal('a');
            expr(expect(this.read()).not.to.exist);
            cb();
        });

        expr(expect(get_sender().write('a')).to.be.true);
    };
}

function multi_byte(get_sender, get_recipient)
{
    return function (cb)
    {
        var send_hash = crypto.createHash('sha256'),
            receive_hash = crypto.createHash('sha256'),
            total = 100 * 1024,
            remaining_out = total,
            remaining_in = remaining_out;

        get_recipient().on('readable', function ()
        {
            var buf;

            while (true)
            {
                buf = this.read();

                if (buf === null)
                {
                    break;
                }

                expect(remaining_in).to.be.at.least(1);
                remaining_in -= buf.length;
                expect(remaining_in).to.be.at.least(0);

                receive_hash.update(buf);

                if (remaining_in === 0)
                {
                    expect(receive_hash.digest()).to.eql(send_hash.digest());
                    cb();
                }
            }
        });

        function send()
        {
            var n = Math.min(Math.floor(Math.random() * 201), remaining_out),
                buf = crypto.randomBytes(n),
                r = get_sender().write(buf);

            send_hash.update(buf);
            remaining_out -= n;

            //console.log(remaining_out);

            if (remaining_out > 0)
            {
                //console.log(r);
                if (r)
                {
                    setTimeout(send, Math.floor(Math.random() * 51));
                }
                else
                {
                //console.log('waiting for drain');
                    get_sender().once('drain', send);
                }
            }
        }

        send();
    };
}

function delay_status(get_sender, get_recipient)
{
    return function (cb)
    {
        var readable_count = 0, read_count = 0, drain_count = 0;

        get_recipient().on('readable', function ()
        {
            readable_count += 1;

            function check()
            {
                expect(read_count).to.equal(100);
                expect(readable_count).to.equal(1);
                expect(drain_count).to.equal(0);
                get_recipient().removeAllListeners('readable');
                get_recipient().read(0);
                cb();
            }

            var buf;

            while (true)
            {
                buf = this.read(null, false);

                if (buf === null)
                {
                    break;
                }
                
                read_count += buf.length;

                expect(read_count).to.be.at.most(100);

                if (read_count === 100)
                {
                    // give time for any unexpected reads and drains
                    setTimeout(check, 2000);
                }
            }
        });

        expr(expect(get_sender().write(new Buffer(101))).to.be.false);

        get_sender().on('drain', function ()
        {
            drain_count += 1;
        });
    };
}

// adapted from test in Node source (test/simple/test-stream2-writable.js)

var chunks = new Array(100), ci;

for (ci = 0; ci < chunks.length; ci += 1)
{
    chunks[ci] = crypto.randomBytes(ci);
}

function write_backpressure(get_sender, get_recipient)
{
    return function (cb)
    {
        var drains = 0,
            i = 0,
            j = 1,
            write_hash = crypto.createHash('sha256'),
            read_hash = crypto.createHash('sha256'),
            write_done = false,
            read_done = false;

        get_recipient().on('readable', function ()
        {
            var buf;

            while (true)
            {
                buf = this.read(j);

                if (buf === null)
                {
                    break;
                }

                read_hash.update(buf);

                j += 1;
            }
        });

        get_recipient().on('end', function ()
        {
            expect(read_hash.digest()).to.eql(write_hash.digest());
            read_done = true;
            if (write_done) { cb(); }
        });

        get_sender().on('finish', function ()
        {
            expect(drains).to.equal(31);
            write_done = true;
            if (read_done) { cb(); }
        });

        get_sender().on('drain', function ()
        {
            drains += 1;
        });

        function write()
        {
            var ret;

            do
            {
                ret = get_sender().write(chunks[i]);
                write_hash.update(chunks[i]);
                i += 1;
            }
            while ((ret !== false) && (i < chunks.length));

            if (i < chunks.length)
            {
                expect(get_sender()._writableState.length).to.be.at.least(100);
                get_sender().once('drain', write);
            }
            else
            {
                get_sender().end();
            }
        }

        write();
    };
}

function read_backpressure(get_sender, get_recipient)
{
    return function (cb)
    {
        var drains = 0, readables = 0;

        get_sender().on('drain', function ()
        {
            drains += 1;
        });

        get_recipient().on('readable', function ()
        {
            readables += 1;
        });

        get_recipient().once('readable', function ()
        {
            expect(drains).to.equal(0);
            expect(readables).to.equal(1);

            get_recipient().once('readable', function ()
            {
                expect(drains).to.equal(1);
                expect(readables).to.equal(2);
                expect(this.read().length).to.equal(1);
                cb();
            });

            expect(this.read().length).to.equal(100);
        });

        expr(expect(get_sender().write(crypto.randomBytes(101))).to.be.false);
    };
}

function flow_mode(get_sender, get_recipient)
{
    return function (cb)
    {
        var send_hash = crypto.createHash('sha256'),
            receive_hash = crypto.createHash('sha256'),
            total = 100 * 1024,
            remaining_out = total,
            remaining_in = remaining_out;

        get_recipient().on('data', function (buf)
        {
            expect(remaining_in).to.be.at.least(1);
            remaining_in -= buf.length;
            expect(remaining_in).to.be.at.least(0);

            receive_hash.update(buf);

            if (remaining_in === 0)
            {
                expect(receive_hash.digest()).to.eql(send_hash.digest());
                cb();
            }
        });

        function send()
        {
            var n = Math.min(Math.floor(Math.random() * 201), remaining_out),
                buf = crypto.randomBytes(n);

            get_sender().write(buf);
            send_hash.update(buf);
            remaining_out -= n;

            if (remaining_out > 0)
            {
                setTimeout(send, Math.floor(Math.random() * 51));
            }
        }

        send();
    };
}

function pipe(get_sender, get_recipient)
{
    return function (cb)
    {
        var in_stream = fs.createReadStream(random_fname);

        tmp.tmpName(function (err, out_fname1)
        {
            if (err) { return cb(err); }
            tmp.tmpName(function (err, out_fname2)
            {
                if (err) { return cb(err); }

                var out_stream1 = fs.createWriteStream(out_fname1),
                    out_stream2 = fs.createWriteStream(out_fname2),
                    finished1 = false,
                    finished2 = false;

                function piped()
                {
                    fs.readFile(random_fname, function (err, in_buf)
                    {
                        if (err) { return cb(err); }
                        fs.readFile(out_fname1, function (err, out_buf1)
                        {
                            if (err) { return cb(err); }
                            fs.readFile(out_fname2, function (err, out_buf2)
                            {
                                if (err) { return cb(err); }
                                expect(in_buf).to.eql(out_buf1);
                                expect(in_buf).to.eql(out_buf2);
                                fs.unlink(out_fname1, function (err)
                                {
                                    if (err) { return cb(err); }
                                    fs.unlink(out_fname2, function (err)
                                    {
                                        if (err) { return cb(err); }
                                        cb();
                                    });
                                });
                            });
                        });
                    });
                }

                out_stream1.on('finish', function ()
                {
                    finished1 = true;
                    if (finished2) { piped(); }
                });

                out_stream2.on('finish', function ()
                {
                    finished2 = true;
                    if (finished1) { piped(); }
                });

                get_recipient().pipe(out_stream1);
                get_recipient().pipe(out_stream2);

                in_stream.pipe(get_sender());
            });
        });
    };
}

function error_event(get_duplex)
{
    return function (cb)
    {
        var err = new Error('foo');

        get_duplex().on('error', function (e)
        {
            expect(e).to.equal(err);
            cb();
        });

        get_duplex()._msg_stream.emit('error', err);
    };
}

function unknown_message(get_sender, get_recipient)
{
    return function (cb)
    {
        get_recipient().on('error', function ()
        {
            cb();
        });

        get_sender()._msg_stream.write({ type: 'foo' });
    };
}

function default_options(make_default_client, get_client)
{
    return function (cb)
    {
        make_default_client(function (err, client_duplex)
        {
            if (err) { return cb(err); }

            primus.once('connection', function (spark2)
            {
                var spark_duplex2 = new PrimusDuplex(spark2);

                spark_duplex2.on('handshake', function ()
                {
                    var done1 = false, done2 = false;

                    function done()
                    {
                        client_duplex.on('end', cb);
                        client_duplex.end();
                        // multi_byte will read the null so end is emitted
                    }

                    both(multi_byte, get_client, get_server)(function (err)
                    {
                        if (err) { return cb(err); }
                        done1 = true;
                        if (done2) { done(); }
                    });

                    both(multi_byte, function ()
                    {
                        return client_duplex;
                    }, function ()
                    {
                        return spark_duplex2;
                    })(function (err)
                    {
                        if (err) { return cb(err); }
                        done2 = true;
                        if (done1) { done(); }
                    });
                });

                spark_duplex2.on('end', function ()
                {
                    this.end();
                });

                spark_duplex2._send_handshake();
            });
        });
    };
}

function emit_error(make_default_client)
{
    return function (cb)
    {
        make_default_client(function (err, client_duplex)
        {
            if (err) { return cb(err); }

            client_duplex.on('error', function ()
            {
                this.on('end', cb);
                this.end();
                // have to read null to get end event
                this.on('readable', function ()
                {
                    this.read();
                });
            });

            primus.once('connection', function (spark2)
            {
                var spark_duplex2 = new PrimusDuplex(spark2);

                spark_duplex2.on('handshake', function ()
                {
                    cb(new Error('should not be called'));
                });

                spark_duplex2.on('end', function ()
                {
                    this.end();
                });

                // have to read null to get end event
                spark_duplex2.on('readable', function ()
                {
                    this.read();
                });

                spark_duplex2._msg_stream.write({ type: 'bar' });
            });
        });
    };
}

function write_before_handshaken(make_default_client)
{
    return function (cb)
    {
        make_default_client(function (err, client_duplex)
        {
            if (err) { return cb(err); }

            var client_done = false, server_done = false;

            client_duplex.once('readable', function ()
            {
                expect(this.read().toString()).to.equal('x');

                this.on('end', function ()
                {
                    client_done = true;
                    if (server_done) { cb(); }
                });

                // have to read null to get end event
                this.on('readable', function ()
                {
                    this.read();
                });
            });

            primus.once('connection', function (spark2)
            {
                var spark_duplex2 = new PrimusDuplex(spark2);

                spark_duplex2.once('readable', function ()
                {
                    expect(this.read().toString()).to.equal('y');

                    this.on('end', function ()
                    {
                        server_done = true;
                        if (client_done) { cb(); }
                    });

                    // have to read null to get end event
                    this.on('readable', function ()
                    {
                        this.read();
                    });

                });

                spark_duplex2.end('x');
                client_duplex.end('y');
                spark_duplex2._send_handshake();
            });
        });
    };
}

function disallow_half_open(make_client)
{
    return function (cb)
    {
        make_client(function (err, client_duplex)
        {
            if (err) { return cb(err); }

            var client_done = false, server_done = false;

            client_duplex.on('handshake', function ()
            {
                var finished = false;

                this.on('finish', function ()
                {
                    finished = true;
                });

                this.on('end', function ()
                {
                    expr(expect(finished).to.be.true);
                    client_done = true;
                    if (server_done) { cb(); }
                });

                this.on('readable', function ()
                {
                    this.read();
                });

                // should close for read too
                this.end();
            });

            primus.once('connection', function (spark2)
            {
                var spark_duplex2 = new PrimusDuplex(spark2,
                {
                    allowHalfOpen: false,
                    initiate_handshake: true
                }), ended = false;

                spark_duplex2.on('end', function ()
                {
                    ended = true;
                });

                spark_duplex2.on('readable', function ()
                {
                    this.read();
                });

                // should close for write after receiving end
                spark_duplex2.on('finish', function ()
                {
                    expr(expect(ended).to.be.true);
                    server_done = true;
                    if (client_done) { cb(); }
                });
            });
        });
    };
}

function max_write_size(make_client)
{
    return function (cb)
    {
        make_client(function (err, client_duplex)
        {
            if (err) { return cb(err); }

            var client_out = crypto.randomBytes(64),
                server_out = crypto.randomBytes(64),
                client_in = [],
                server_in = [];

            function check()
            {
                expect(client_in.length).to.be.at.most(4);
                expect(server_in.length).to.be.at.most(4);

                if ((client_in.length === 4) &&
                    (server_in.length === 4))
                {
                    expect(Buffer.concat(client_in)).to.eql(server_out);
                    expect(Buffer.concat(server_in)).to.eql(client_out);
                    client_duplex.end();
                }
            }

            client_duplex.on('handshake', function ()
            {
                this.write(client_out);
            });

            client_duplex.on('end', cb);

            client_duplex.on('readable', function ()
            {
                var data = this.read();

                if (data)
                {
                    expect(data.length).to.equal(16);
                    client_in.push(data);
                    check();
                }
            });

            primus.once('connection', function (spark2)
            {
                var spark_duplex2 = new PrimusDuplex(spark2,
                {
                    max_write_size: 16,
                    highWaterMark: 100,
                    initiate_handshake: true
                });

                spark_duplex2.on('readable', function ()
                {
                    var data = this.read();

                    if (data)
                    {
                        expect(data.length).to.equal(16);
                        server_in.push(data);
                        check();
                    }
                });

                spark_duplex2.on('end', function ()
                {
                    this.end();
                });

                spark_duplex2.write(server_out);
            });
        });
    };
}

function both(f, gc, gs)
{
    return function (cb)
    {
        var done1 = false, done2 = false;

        f(gc, gs, true)(function (err)
        {
            if (err) { return cb(err); }
            done1 = true;
            if (done2) { cb(); }
        });

        f(gs, gc, true)(function (err)
        {
            if (err) { return cb(err); }
            done2 = true;
            if (done1) { cb(); }
        });
    };
}

describe('PrimusDuplex (Node)', function ()
{
    var client_duplex;

    function make_client(cb)
    {
        client_duplex = new PrimusDuplex(new Socket(client_url),
        {
            highWaterMark: 100
        });

        client_duplex.name = 'client';

        cb();
    }

    function get_client()
    {
        return client_duplex;
    }

    beforeEach(connect(make_client));

    afterEach(closedown(function (cb)
    {
        client_duplex.end();
        if (client_duplex._readableState.ended) { return cb(); }

        client_duplex.on('end', cb);

        // read out any existing data
        client_duplex.on('readable', drain);
        drain.call(client_duplex);
    }));
   
    it('should send a single byte from client to server',
       single_byte(get_client, get_server));
    it('should send a single byte from server to client',
       single_byte(get_server, get_client));
    it('should send a single byte both directions at once',
       both(single_byte, get_client, get_server));

    it('should send multiple bytes from client to server',
       multi_byte(get_client, get_server));
    it('should send multiple bytes from server to client',
       multi_byte(get_server, get_client));
    it('should send multiple bytes in both directions at once',
       both(multi_byte, get_client, get_server));

    it('should be able to delay server status messages',
       delay_status(get_client, get_server));
    it('should be able to delay client status messages',
       delay_status(get_server, get_client));
    it('should be able to delay both client and status messages at once',
       both(delay_status, get_client, get_server));

    it('should handle client write backpressure',
       write_backpressure(get_client, get_server));
    it('should handle server write backpressure',
       write_backpressure(get_server, get_client));
    it('should handle write backpressure in both directions at once',
       both(write_backpressure, get_client, get_server));

    it('should handle server read backpressure',
       read_backpressure(get_client, get_server));
    it('should handle client read backpressure',
       read_backpressure(get_server, get_client));
    it('should handle read backpressure in both directions at once',
       both(read_backpressure, get_client, get_server));

    it('should handle flow mode from client to server',
       flow_mode(get_client, get_server));
    it('should handle flow mode from server to client',
       flow_mode(get_server, get_client));
    it('should handle flow mode in both directions at once',
       both(flow_mode, get_client, get_server));

    it('should be able to pipe from client to server',
       pipe(get_client, get_server));
    it('should be able to pipe from server to client',
       pipe(get_server, get_client));
    it('should be able to pipe in both directions at once',
       both(pipe, get_client, get_server));

    it('should expose client error events',
       error_event(get_client));
    it('should expose server error events',
       error_event(get_server));

    it('should emit an error if server receives an unknown message',
       unknown_message(get_client, get_server));
    it('should emit an error if client receives an unknown message',
       unknown_message(get_server, get_client));

    function make_default_client(cb)
    {
        cb(null, new PrimusDuplex(new Socket(client_url)));
    }

    it('should support default options',
       default_options(make_default_client, get_client));
    
    it('should emit an error if first message is not handshake',
       emit_error(make_default_client));

    it('should support writing before handshaken',
       write_before_handshaken(make_default_client));

    it('should support allowHalfOpen=false',
       disallow_half_open(function (cb)
       {
           cb(null, new PrimusDuplex(new Socket(client_url),
           {
               allowHalfOpen: false
           }));
       }));

    it('should support a maximum remote free size',
       max_write_size(function (cb)
       {
           cb(null, new PrimusDuplex(new Socket(client_url),
           {
               max_write_size: 16,
               highWaterMark: 100
           }));
       }));
});

/*global expect: false,
         expr: false,
         crypto: false,
         it: false,
         get_server: false,
         Primus: false,
         PrimusDuplex: false,
         client_duplexes: false,
         node_crypto: false,
         client_index: true,
         NodeBuffer: false,
         client_url: false,
         primus: false,
         fs: false,
         tmp: false,
         random_fname: false,
         closedown: false,
         connect: false,
         beforeEach: false,
         afterEach: false,
         describe: false,
         before: false,
         after: false,
         static_url: false,
         async: false */
/*jslint node: true, nomen: true, unparam: true, bitwise: true */
"use strict";

var wd = require('wd');

describe('PrimusDuplex (browser)', function ()
{
    var browser,
        client_duplex_name,
        in_browser_queue,
        timeout = this.timeout();

    before(function (cb)
    {
        browser = wd.remote();

        browser.init(
        {
            browserName: 'chrome',
            chromeOptions: {
                w3c: false
            }
        },
        function (err)
        {
            if (err) { return cb(err); }
            browser.get(static_url + '/loader.html', function (err)
            {
                if (err) { return cb(err); }
                browser.setAsyncScriptTimeout(timeout, cb);
            });
        });
    });

    after(function (cb)
    {
        browser.quit(cb);
    });

    function _in_browser(f /*, args..., test, cb*/)
    {
        var test = arguments[arguments.length - 2],
            cb = arguments[arguments.length - 1],

        f2 = function (f /*, args..., done*/)
        {
            var r = {},
                done = arguments[arguments.length - 1];

            try
            {
                f.apply(this, Array.prototype.slice.call(arguments, 1, arguments.length - 1).concat([
                function (err)
                {
                    if (err)
                    {
                        r.err = err.toString() + '\n' + err.stack;
                    }
                    else
                    {
                        r.vals = Array.prototype.slice.call(arguments, 1);
                    }

                    done(r);
                }]));
            }
            catch (ex)
            {
                r.err = ex.toString() + '\n' + ex.stack;
                done(r);
            }
        };

        browser.executeAsync('return ' + f2 + '.apply(this, [' + f + '].concat(Array.prototype.slice.call(arguments)))',
                        Array.prototype.slice.call(arguments, 1, arguments.length - 2),
        function (err, r)
        {
            if (err) { return cb(err); }
            if (r.err) { return cb(new Error(r.err)); }
            if (!test) { return cb.apply(this, [null].concat(r.vals)); }

            try
            {
                test.apply(this, r.vals.concat([cb]));
            }
            catch (ex)
            {
                cb(ex);
            }
        });
    }

    in_browser_queue = async.queue(function (task, next)
    {
        var test = task.args[task.args.length - 2],
            cb = task.args[task.args.length - 1],
            test2, cb2;

        if (test)
        {
            test2 = function ()
            {
                var ths = this, args = arguments;
                setTimeout(function ()
                {
                    test.apply(ths, args);
                }, 0);
                next();
            };
            cb2 = cb;
        }
        else
        {
            test2 = null;
            cb2 = function ()
            {
                var ths = this, args = arguments;
                setTimeout(function ()
                {
                    cb.apply(ths, args);
                }, 0);
                next();
            };
        }

        _in_browser.apply(this, Array.prototype.slice.call(task.args, 0, task.args.length - 2).concat([test2, cb2]));
    }, 1);

    function in_browser()
    {
        in_browser_queue.push({ args: arguments });
    }

    function wait_browser(/*f, args..., test, cb*/)
    {
        /*jshint validthis: true */
        var ths = this,
            args = arguments,
            test = arguments[arguments.length - 2],
            cb = arguments[arguments.length - 1];

        in_browser.apply(this, Array.prototype.slice.call(arguments, 0, arguments.length - 2).concat([function (ready /*, args..., cb2*/)
        {
            var cb2 = arguments[arguments.length - 1];

            if (ready)
            {
                if (!test) { return cb2.apply(this, [null].concat(Array.prototype.slice.call(arguments, 1, arguments.length - 1))); }

                try
                {
                    return test.apply(this, Array.prototype.slice.call(arguments, 1));
                }
                catch (ex)
                {
                    return cb2(ex);
                }
            }

            setTimeout(function ()
            {
                wait_browser.apply(ths, args);
            }, 500);
        }, cb]));
    }

    function get_client_duplex_name()
    {
        return client_duplex_name;
    }

    function make_client(cb)
    {
        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url),
            {
                highWaterMark: 100
            }), name = 'client_' + client_index;

            client_index += 1;
            client_duplexes[name] = client_duplex;
            
            cb(null, name);
        },
        client_url,
        null,
        function (err, name)
        {
            if (err) { return cb(err); }
            client_duplex_name = name;
            cb();
        });
    }

    beforeEach(connect(make_client));

    afterEach(closedown(function (cb)
    {
        in_browser(function (name, cb)
        {
            function drain()
            {
                /*jshint validthis: true */
                var buf;
                do
                {
                    buf = this.read();
                } while (buf !== null);
            }

            var client_duplex = client_duplexes[name];
            delete client_duplexes[name];

            client_duplex.end();
            if (client_duplex._readableState.ended) { return cb(); }

            client_duplex.on('end', cb);

            // read out any existing data
            client_duplex.on('readable', drain);
            drain.call(client_duplex);
        }, client_duplex_name, null, cb);
    }));

    function both(f1, f2, gcn, gs)
    {
        return function (cb)
        {
            var done1 = false, done2 = false;

            f1(gcn, gs, true)(function (err)
            {
                if (err) { return cb(err); }
                done1 = true;
                if (done2) { cb(); }
            });

            f2(gcn, gs, true)(function (err)
            {
                if (err) { return cb(err); }
                done2 = true;
                if (done1) { cb(); }
            });
        };
    }

    function single_byte_client_server(get_client_name, get_server)
    {
        return function (cb)
        {
            var client_done = false, server_done = false;

            // once because we don't care about readable emitted when we push null
            get_server().once('readable', function ()
            {
                expect(this.read().toString()).to.equal('a');
                expr(expect(this.read()).not.to.exist);
                server_done = true;
                if (client_done) { cb(); }
            });

            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null, client_duplex.write('a'));
            }, get_client_name(), function (r, cb)
            {
                expr(expect(r).to.be.true);
                client_done = true;
                if (server_done) { cb(); }
            }, cb);
        };
    }

    function single_byte_server_client(get_client_name, get_server)
    {
        return function (cb)
        {
            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                client_duplex.once('readable', function ()
                {
                    this.single_ready = true;
                    this.single_read1 = this.read().toString();
                    this.single_read2 = this.read();
                });
                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }

                expr(expect(get_server().write('a')).to.be.true);

                wait_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null,
                       client_duplex.single_ready,
                       client_duplex.single_read1,
                       client_duplex.single_read2);
                }, get_client_name(), function (read1, read2, cb)
                {
                    expect(read1).to.equal('a');
                    expr(expect(read2).not.to.exist);
                    cb();
                }, cb);
            });
        };
    }
   
    function multi_bytes_client_server(get_client_name, get_server)
    {
        return function (cb)
        {
            var receive_hash = crypto.createHash('sha256'),
                receive_sum = 0, 
                total = 100 * 1024,
                remaining_in = total;

            function check()
            {
                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null, client_duplex.send_sum, client_duplex.send_hash.digest('base64'));
                }, get_client_name(), function (send_sum, send_hash, cb)
                {
                    expect(receive_sum).to.equal(send_sum);
                    expect(receive_hash.digest('base64')).to.equal(send_hash);
                    cb();
                }, cb);
            }

            get_server().on('readable', function ()
            {
                var buf, i;

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

                    for (i = 0; i < buf.length; i += 1)
                    {
                        receive_sum += buf[i];
                    }

                    if (remaining_in === 0)
                    {
                        console.log('c2s remaining_in', get_client_name(), get_server().name, remaining_in);
                        check();
                    }
                }
            });

            in_browser(function (name, remaining_out, cb)
            {
                var client_duplex = client_duplexes[name];
                client_duplex.send_hash = node_crypto.createHash('sha256');
                client_duplex.send_sum = 0;

                function send()
                {
                    var n = Math.min(Math.floor(Math.random() * 201), remaining_out),
                        buf = node_crypto.randomBytes(n),
                        r, i;

                    for (i = 0; i < n; i += 1)
                    {
                        client_duplex.send_sum += buf[i];
                    }
                        
                    client_duplex.send_hash.update(buf);
                    r = client_duplex.write(buf);
                    remaining_out -= n;

                    if (remaining_out > 0)
                    {
                        if (r)
                        {
                            setTimeout(send, Math.floor(Math.random() * 51));
                        }
                        else
                        {
                            client_duplex.once('drain', send);
                        }
                    }
                }

                setTimeout(send, 0);
                cb();
            }, get_client_name(), total, null, function (err)
            {
                if (err) { return cb(err); }
            });
        };
    }

    function multi_bytes_server_client(get_client_name, get_server)
    {
        return function (cb)
        {
            var send_hash = crypto.createHash('sha256'),
                send_sum = 0,
                total = 100 * 1024,
                remaining_out = total;

            in_browser(function (name, remaining_in, cb)
            {
                var client_duplex = client_duplexes[name];
                client_duplex.receive_hash = node_crypto.createHash('sha256');
                client_duplex.receive_sum = 0;

                client_duplex.on('readable', function ()
                {
                    var buf, i;

                    while (true)
                    {
                        buf = this.read();
                        if (buf === null) { break; }

                        remaining_in -= buf.length;

                        client_duplex.receive_hash.update(buf);

                        for (i = 0; i < buf.length; i += 1)
                        {
                            client_duplex.receive_sum += buf[i];
                        }

                        if (remaining_in === 0)
                        {
                            client_duplex.receive_digest = client_duplex.receive_hash.digest('base64');
                        }
                    }
                });

                cb();
            }, get_client_name(), total, null, function (err)
            {
                if (err) { return cb(err); }
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null,
                   !!client_duplex.receive_digest, 
                   client_duplex.receive_sum,
                   client_duplex.receive_digest);
            }, get_client_name(), function (receive_sum, receive_digest, cb)
            {
                expect(receive_sum).to.equal(send_sum);
                expect(receive_digest).to.equal(send_hash.digest('base64'));
                console.log('s2c remaining_in', get_client_name(), get_server().name, 0);
                cb();
            }, cb);

            function send()
            {
                var n = Math.min(Math.floor(Math.random() * 201), remaining_out),
                    buf = crypto.randomBytes(n),
                    r = get_server().write(buf),
                    i;

                for (i = 0; i < n; i += 1)
                {
                    send_sum += buf[i];
                }

                send_hash.update(buf);
                remaining_out -= n;

                if (remaining_out > 0)
                {
                    if (r)
                    {
                        setTimeout(send, Math.floor(Math.random() * 51));
                    }
                    else
                    {
                        get_server().once('drain', send);
                    }
                }
            }

            send();
        };
    }

    function delay_server_status(get_client_name, get_server)
    {
        return function (cb)
        {
            var drain_count = 0;
            
            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.read_count = 0;
                client_duplex.readable_count = 0;

                client_duplex.on('readable', function ()
                {
                    this.readable_count += 1;

                    var buf;

                    while (true)
                    {
                        buf = this.read(null, false);
                        if (buf === null) { break; }

                        this.read_count += buf.length;
                    }
                });

                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null, client_duplex.read_count === 100);
            }, get_client_name(), function (cb)
            {
                console.log('dss read 100');
                // give time for any unexpected reads and drains
                setTimeout(function ()
                {
                    in_browser(function (name, cb)
                    {
                        var client_duplex = client_duplexes[name];
                        client_duplex.removeAllListeners('readable');
                        cb(null,
                           client_duplex.read_count,
                           client_duplex.readable_count);
                    }, get_client_name(), function (read_count, readable_count, cb)
                    {
                        expect(read_count).to.equal(100);
                        expect(readable_count).to.equal(1);
                        expect(drain_count).to.equal(0);
                        cb();
                    }, cb);
                }, 2000);
            }, cb);

            expr(expect(get_server().write(Buffer.alloc(101))).to.be.false);

            get_server().on('drain', function ()
            {
                drain_count += 1;
            });
        };
    }

    function delay_client_status(get_client_name, get_server)
    {
        return function (cb)
        {
            var readable_count = 0, read_count = 0;

            function check()
            {
                expect(read_count).to.equal(100);
                expect(readable_count).to.equal(1);
                get_server().removeAllListeners('readable');

                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null, client_duplex.drain_count);
                }, get_client_name(), function (drain_count, cb)
                {
                    expect(drain_count).to.equal(0);
                    cb();
                }, cb);
            }

            get_server().on('readable', function ()
            {
                readable_count += 1;

                var buf;

                while (true)
                {
                    buf = this.read(null, false);
                    if (buf === null) { break; }

                    read_count += buf.length;

                    if (read_count === 100)
                    {
                        console.log('dcs read 100');
                        // give time for any unexpected reads and drains
                        setTimeout(check, 2000);
                    }
                }
            });

            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name],
                    r = client_duplex.write(NodeBuffer.alloc(101));

                client_duplex.drain_count = 0;

                client_duplex.on('drain', function ()
                {
                    this.drain_count += 1;
                });

                cb(null, r);
            }, get_client_name(), function (r, cb)
            {
                expr(expect(r).to.be.false);
                cb();
            }, function (err)
            {
                if (err) { return cb(err); }
            });
        };
    }
    
    function client_write_backpressure(get_client_name, get_server)
    {
        return function (cb)
        {
            var j = 1,
                read_hash = crypto.createHash('sha256'),
                write_done = false,
                read_done = false;

            get_server().on('readable', function ()
            {
                var buf;

                while (true)
                {
                    buf = this.read(j);
                    if (buf === null) { break; }

                    read_hash.update(buf);

                    j += 1;
                }
            });

            get_server().on('end', function ()
            {
                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null, client_duplex.write_hash.digest('base64'));
                }, get_client_name(), function (write_digest, cb)
                {
                    expect(read_hash.digest('base64')).to.equal(write_digest);
                    read_done = true;
                    console.log("client wbp read done");
                    if (write_done) { cb(); }
                }, cb);
            });

            in_browser(function (name, cb)
            {
                var chunks = new Array(100),
                    ci,
                    client_duplex = client_duplexes[name],
                    i = 0;

                for (ci = 0; ci < chunks.length; ci += 1)
                {
                    chunks[ci] = node_crypto.randomBytes(ci);
                }

                client_duplex.finished = false;
                client_duplex.drains = 0;
                client_duplex.write_hash = node_crypto.createHash('sha256');

                client_duplex.on('finish', function ()
                {
                    this.finished = true;
                });

                client_duplex.on('drain', function ()
                {
                    this.drains += 1;
                });
                
                function write()
                {
                    var ret;

                    do
                    {
                        ret = client_duplex.write(chunks[i]);
                        client_duplex.write_hash.update(chunks[i]);
                        i += 1;
                    }
                    while ((ret !== false) && (i < chunks.length));

                    if (i < chunks.length)
                    {
                        client_duplex.once('drain', write);
                    }
                    else
                    {
                        client_duplex.end();
                    }
                }

                setTimeout(write, 0);
                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null, client_duplex.finished, client_duplex.drains);
            }, get_client_name(), function (drains, cb)
            {
                expect(drains).to.equal(33);
                write_done = true;
                console.log("client wbp write done");
                if (read_done) { cb(); }
            }, cb);
        };
    }

    function server_write_backpressure(get_client_name, get_server)
    {
        return function (cb)
        {
            var i = 0,
                drains = 0,
                write_hash = crypto.createHash('sha256'),
                write_done = false,
                read_done = false,
                chunks = new Array(100),
                ci;

            for (ci = 0; ci < chunks.length; ci += 1)
            {
                chunks[ci] = crypto.randomBytes(ci);
            }

            in_browser(function (name, cb)
            {
                var j = 1,
                    client_duplex = client_duplexes[name];

                client_duplex.ended = false;
                client_duplex.read_hash = node_crypto.createHash('sha256');

                client_duplex.on('readable', function ()
                {
                    var buf;

                    while (true)
                    {
                        buf = this.read(j);
                        if (buf === null) { break; }

                        this.read_hash.update(buf);

                        j += 1;
                    }
                });

                client_duplex.on('end', function ()
                {
                    this.ended = true;
                });
                 
                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }

                get_server().on('finish', function ()
                {
                    expect(drains).to.equal(33);
                    write_done = true;
                    console.log("server wbp write done");
                    if (read_done) { cb(); }
                });

                get_server().on('drain', function ()
                {
                    drains += 1;
                });

                function write()
                {
                    var ret;

                    do
                    {
                        ret = get_server().write(chunks[i]);
                        write_hash.update(chunks[i]);
                        i += 1;
                    }
                    while ((ret !== false) && (i < chunks.length));

                    if (i < chunks.length)
                    {
                        get_server().once('drain', write);
                    }
                    else
                    {
                        get_server().end();
                    }
                }
                
                write();
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                if (client_duplex.ended)
                {
                    cb(null, true, client_duplex.read_hash.digest('base64'));
                }
                else
                {
                    cb(null, false);
                }
            }, get_client_name(), function (read_digest, cb)
            {
                expect(read_digest).to.equal(write_hash.digest('base64'));
                read_done = true;
                console.log("server wbp read done");
                if (write_done) { cb(); }
            }, cb);
        };
    }
   
    function server_read_backpressure(get_client_name, get_server)
    {
        return function (cb)
        {
            var readables = 0;

            get_server().on('readable', function ()
            {
                readables += 1;
            });

            get_server().once('readable', function ()
            {
                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null, client_duplex.drains);
                }, get_client_name(), function (drains, cb)
                {
                    expect(drains).to.equal(0);
                    expect(readables).to.equal(1);

                    get_server().once('readable', function ()
                    {
                        in_browser(function (name, cb)
                        {
                            var client_duplex = client_duplexes[name];
                            cb(null, client_duplex.drains);
                        }, get_client_name(), function (drains, cb)
                        {
                            expect(drains).to.equal(1);
                            expect(readables).to.equal(2);
                            expect(get_server().read().length).to.equal(1);
                            cb();
                        }, cb);
                    });

                    expect(get_server().read().length).to.equal(100);
                }, cb);
            });

            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.drains = 0;

                client_duplex.on('drain', function ()
                {
                    this.drains += 1;
                });

                cb(null, client_duplex.write(node_crypto.randomBytes(101)));
            }, get_client_name(), function (r)
            {
                expr(expect(r).to.be.false);
            }, cb);
        };
    }

    function client_read_backpressure(get_client_name, get_server)
    {
        return function (cb)
        {
            var drains = 0;

            get_server().on('drain', function ()
            {
                drains += 1;
            });

            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.readables = 0;

                client_duplex.on('readable', function ()
                {
                    this.readables += 1;
                });
                
                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }
                expr(expect(get_server().write(crypto.randomBytes(101))).to.be.false);
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null, client_duplex.readables === 1);
            }, get_client_name(), function (cb)
            {
                expect(drains).to.equal(0);

                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null, client_duplex.read().length);    
                }, get_client_name(), function (r)
                {
                    expect(r).to.equal(100);
                }, cb);

                wait_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null, client_duplex.readables === 2);
                }, get_client_name(), function (cb)
                {
                    expect(drains).to.equal(1);

                    in_browser(function (name, cb)
                    {
                        var client_duplex = client_duplexes[name];
                        cb(null, client_duplex.read().length);
                    }, get_client_name(), function (r, cb)
                    {
                        expect(r).to.equal(1);
                        cb();
                    }, cb);
                }, cb);
            }, cb);
        };
    }
   
    function flow_client_server(get_client_name, get_server)
    {
        return function (cb)
        {
            var receive_hash = crypto.createHash('sha256'),
                total = 100 * 1024,
                remaining_in = total;

            get_server().on('data', function (buf)
            {
                expect(remaining_in).to.be.at.least(1);
                remaining_in -= buf.length;
                expect(remaining_in).to.be.at.least(0);

                receive_hash.update(buf);

                if (remaining_in === 0)
                {
                    in_browser(function (name, cb)
                    {
                        var client_duplex = client_duplexes[name];
                        cb(null, client_duplex.send_hash.digest('base64'));
                    }, get_client_name(), function (send_digest, cb)
                    {
                        expect(receive_hash.digest('base64')).to.equal(send_digest);
                        cb();
                    }, cb);
                }
            });

            in_browser(function (name, remaining_out, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.send_hash = node_crypto.createHash('sha256');

                function send()
                {
                    var n = Math.min(Math.floor(Math.random() * 201), remaining_out),
                        buf = node_crypto.randomBytes(n);

                    client_duplex.write(buf);
                    client_duplex.send_hash.update(buf);
                    remaining_out -= n;

                    if (remaining_out > 0)
                    {
                        setTimeout(send, Math.floor(Math.random() * 51));
                    }
                }

                setTimeout(send, 0);
                cb();
            }, get_client_name(), total, null, function (err)
            {
                if (err) { return cb(err); }
            });
        };
    }
    
    function flow_server_client(get_client_name, get_server)
    {
        return function (cb)
        {
            var send_hash = crypto.createHash('sha256'),
                total = 100 * 1024,
                remaining_out = total;

            in_browser(function (name, remaining_in, cb)
            {
                var receive_hash = node_crypto.createHash('sha256'),
                    client_duplex = client_duplexes[name];

                client_duplex.on('data', function (buf)
                {
                    remaining_in -= buf.length;
                    this.remaining_in = remaining_in;
                    receive_hash.update(buf);

                    if (remaining_in === 0)
                    {
                        this.receive_digest = receive_hash.digest('base64');
                    }
                });

                cb();
            }, get_client_name(), total, null, function (err)
            {
                if (err) { return cb(err); }
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null,
                   !!client_duplex.receive_digest,
                   client_duplex.receive_digest);
            }, get_client_name(), function (receive_digest, cb)
            {
                expect(receive_digest).to.equal(send_hash.digest('base64'));

                // check no other data arrives
                setTimeout(function ()
                {
                    in_browser(function (name, cb)
                    {
                        var client_duplex = client_duplexes[name];
                        cb(null, client_duplex.remaining_in);
                    }, get_client_name(), function (remaining_in, cb)
                    {
                        expect(remaining_in).to.equal(0);
                        cb();
                    }, cb);
                }, 2000);
            }, cb);

            function send()
            {
                var n = Math.min(Math.floor(Math.random() * 201), remaining_out),
                    buf = crypto.randomBytes(n);

                get_server().write(buf);
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

    function pipe(get_client_name, get_server)
    {
        return function (cb)
        {
            var in_stream = fs.createReadStream(random_fname);

            tmp.tmpName(function (err, out_fname)
            {
                if (err) { return cb(err); }

                var out_stream = fs.createWriteStream(out_fname);

                out_stream.on('finish', function ()
                {
                    fs.readFile(random_fname, function (err, in_buf)
                    {
                        if (err) { return cb(err); }
                        fs.readFile(out_fname, function (err, out_buf)
                        {
                            if (err) { return cb(err); }
                            expect(in_buf).to.eql(out_buf);
                            fs.unlink(out_fname, function (err)
                            {
                                if (err) { return cb(err); }
                                cb();
                            });
                        });
                    });

                });

                get_server().pipe(out_stream);
                in_stream.pipe(get_server());

                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    client_duplex.pipe(client_duplex);
                    cb();
                }, get_client_name(), null, function (err)
                {
                    if (err) { return cb(err); }
                });
            });
        };
    }
    
    function error_event(get_client_name)
    {
        return function (cb)
        {
            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.on('error', function (err)
                {
                    cb(null, err.message);
                });

                client_duplex.msg_stream.emit('error', new Error('foo'));
            }, get_client_name(), function (err, cb)
            {
                expect(err).to.equal('foo');
                cb();
            }, cb);
        };
    }
    
    function unknown_message(get_client_name, get_server)
    {
        return function (cb)
        {
            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.on('error', function (err)
                {
                    this.errored = err.message;
                });

                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }
                get_server().write('a', function (err)
                {
                    if (err) { return cb(err); }
                    get_server().msg_stream.write({ type: 'foo' });
                });
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null, !!client_duplex.errored, client_duplex.errored);
            }, get_client_name(), function (msg, cb)
            {
                expect(msg).to.equal('unknown type: foo');
                cb();
            }, cb);
        };
    }

    function read_overflow_client_server(get_client_name, get_server)
    {
        return function (cb)
        {
            get_server().msg_stream.prependOnceListener('data', function ()
            {
                get_server().unshift(Buffer.alloc(1));
            });

            get_server().on('error', function (err)
            {
                expect(err.message).to.equal('too much data');
                cb();
            });
            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                client_duplex.write(NodeBuffer.alloc(100));
                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }
            });
        };
    }

    function read_overflow_server_client(get_client_name, get_server)
    {
        return function (cb)
        {
            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.once('readable', function ()
                {
                    this.read(1);
                    this.unshift(NodeBuffer.alloc(2));
                });

                client_duplex.on('error', function (err)
                {
                    this.errored = err.message;
                });

                cb();
            }, get_client_name(), null, function (err)
            {
                if (err) { return cb(err); }
                get_server().write('a');
                get_server().write(Buffer.alloc(100));
            });

            wait_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];
                cb(null, !!client_duplex.errored, client_duplex.errored);
            }, get_client_name(), function (msg, cb)
            {
                expect(msg).to.equal('too much data');
                cb();
            }, cb);
        };
    }

    it('should send a single byte from client to server',
       single_byte_client_server(get_client_duplex_name, get_server));

    it('should send a single byte from server to client',
       single_byte_server_client(get_client_duplex_name, get_server));

    it('should send a single byte in both directions',
       both(single_byte_client_server,
            single_byte_server_client,
            get_client_duplex_name,
            get_server));

    it('should send multiple bytes from client to server',
       multi_bytes_client_server(get_client_duplex_name, get_server));

    it('should send multiple bytes from server to client',
       multi_bytes_server_client(get_client_duplex_name, get_server));

    it('should send multiple bytes in both directions',
       both(multi_bytes_client_server,
            multi_bytes_server_client,
            get_client_duplex_name,
            get_server));

    it('should be able to delay server status messages',
       delay_server_status(get_client_duplex_name, get_server));
    
    it('should be able to delay client status messages',
       delay_client_status(get_client_duplex_name, get_server));

    it('should be able to delay server and client status messages',
       both(delay_server_status,
            delay_client_status,
            get_client_duplex_name,
            get_server));

    it('should handle client write backpressure',
       client_write_backpressure(get_client_duplex_name, get_server));

    it('should handle server write backpressure',
       server_write_backpressure(get_client_duplex_name, get_server)); 

    it('should handle client and server write backpressure',
       both(client_write_backpressure,
            server_write_backpressure,
            get_client_duplex_name,
            get_server));
 
    it('should handle server read backpressure',
       server_read_backpressure(get_client_duplex_name, get_server));
    
    it('should handle client read backpressure',
       client_read_backpressure(get_client_duplex_name, get_server));

    it('should handle server and client read backpressure',
       both(server_read_backpressure,
            client_read_backpressure,
            get_client_duplex_name,
            get_server));

    it('should handle flow mode from client to server',
       flow_client_server(get_client_duplex_name, get_server));
    
    it('should handle flow mode from server to client',
       flow_server_client(get_client_duplex_name, get_server)); 

    it('should handle flow mode between client and server in both directions',
       both(flow_client_server,
            flow_server_client,
            get_client_duplex_name,
            get_server));

    it('should be able to pipe from server to client and back',
       pipe(get_client_duplex_name, get_server));
    
    it('should expose client error events',
       error_event(get_client_duplex_name, get_server));

    it('should emit an error if client receives an unknown message',
       unknown_message(get_client_duplex_name, get_server));

    it('should support default options', function (cb)
    {
        var spark_duplex2, client_duplex_name2;

        function doit()
        {
            var done1 = false, done2 = false;

            function done()
            {
                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    client_duplex.on('end', cb);
                    client_duplex.end();
                    // multi_byte will read the null so end is emitted
                }, client_duplex_name2, null, cb);
            }

            both(multi_bytes_client_server,
                 multi_bytes_server_client,
                 get_client_duplex_name,
                 get_server)(function (err)
                 {
                     if (err) { return cb(err); }
                     done1 = true;
                     if (done2) { done(); }
                 });

            both(multi_bytes_client_server,
                 multi_bytes_server_client,
                 function ()
                 {
                     return client_duplex_name2;
                 }, function ()
                 {
                     return spark_duplex2;
                 })(function (err)
                 {
                     if (err) { return cb(err); }
                     done2 = true;
                     if (done1) { done(); }
                 });
        }

        primus.once('connection', function (spark2)
        {
            var duplex = new PrimusDuplex(spark2);
            duplex.name = 'spark2';

            duplex.on('end', function ()
            {
                this.end();
            });

            spark_duplex2 = duplex;
            if (client_duplex_name2) { doit(); }
        });

        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url)),
                name = 'client_' + client_index;

            client_index += 1;
            client_duplexes[name] = client_duplex;
            
            cb(null, name);
        },
        client_url,
        null,
        function (err, name)
        {
            if (err) { return cb(err); }
            client_duplex_name2 = name;
            if (spark_duplex2) { doit(); }
        });
    });

    it('should emit an error if first message is not handshake', function (cb)
    {
        primus.once('connection', function (spark2)
        {
            var duplex = new PrimusDuplex(spark2,
            {
                _delay_handshake: true
            });

            duplex.on('end', function ()
            {
                this.end();
            });

            // have to read null to get end event
            duplex.on('readable', function ()
            {
                this.read();
            });

            duplex.msg_stream.write({ type: 'bar' });
        });

        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url)),
                name = 'client_' + client_index;

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('error', function (err)
            {
                this.on('end', function ()
                {
                    cb(null, err.message);
                });
                this.end();
                // have to read null to get end event
                client_duplex.on('readable', function ()
                {
                    this.read();
                });
            });
        },
        client_url,
        null,
        function (err, msg)
        {
            expect(msg).to.equal('expected handshake, got: bar');
            cb(err);
        });
    });

    it('should support writing before handshaken', function (cb)
    {
        var client_done = false, server_done = false;

        primus.once('connection', function (spark2)
        {
            var duplex = new PrimusDuplex(spark2,
            {
                _delay_handshake: true
            });

            duplex.once('readable', function ()
            {
                expect(this.read().toString()).to.equal('y');

                this.on('end', function ()
                {
                    server_done = true;
                    if (client_done) { cb(); }
                });

                // have to read null to get end event
                duplex.on('readable', function ()
                {
                    this.read();
                });
            });

            duplex.end('x');
            duplex._send_handshake();
        });

        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url)),
                name = 'client_' + client_index;

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.once('readable', function ()
            {
                var data = this.read();

                this.on('end', function ()
                {
                    cb(null, data.toString());
                });

                // have to read null to get end event
                this.on('readable', function ()
                {
                    this.read();
                });
            });

            client_duplex.end('y');
        },
        client_url,
        null,
        function (err, data)
        {
            if (err) { return cb(err); }
            expect(data).to.equal('x');
            client_done = true;
            if (server_done) { cb(); }
        });
    });

    it('should support allowHalfOpen=false', function (cb)
    {
        var client_done = false, server_done = false;

        primus.once('connection', function (spark2)
        {
            var duplex = new PrimusDuplex(spark2,
            {
                allowHalfOpen: false
            }), ended = false;

            duplex.on('end', function ()
            {
                ended = true;
            });

            duplex.on('readable', function ()
            {
                this.read();
            });

            // should close for write after receiving end
            duplex.on('finish', function ()
            {
                expr(expect(ended).to.be.true);
                server_done = true;
                if (client_done) { cb(); }
            });

            duplex.write('a');
        });

        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url),
                {
                    allowHalfOpen: false
                }),
                name = 'client_' + client_index,
                finished = false;

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('finish', function ()
            {
                finished = true;
            });

            client_duplex.on('end', function ()
            {
                cb(null, finished);
            });

            client_duplex.once('readable', function ()
            {
                this.read();

                client_duplex.on('readable', function ()
                {
                    while (true)
                    {
                        if (!this.read()) { break; }
                    }
                });

                this.end();
            });
        },
        client_url,
        null,
        function (err, finished)
        {
            if (err) { return cb(err); }
            expr(expect(finished).to.be.true);
            client_done = true;
            if (server_done) { cb(); }
        });
    });

    it('should support a maximum write size', function (cb)
    {
        var client_out = crypto.randomBytes(64),
            server_out = crypto.randomBytes(64),
            server_in = [];

        primus.once('connection', function (spark2)
        {
            var duplex = new PrimusDuplex(spark2,
            {
                max_write_size: 16,
                highWaterMark: 100
            });

            duplex.on('readable', function ()
            {
                var data = this.read();

                if (data)
                {
                    expect(data.length).to.equal(16);
                    server_in.push(data);
                }
            });

            duplex.on('end', function ()
            {
                this.end();
            });

            duplex.write(server_out);
        });

        in_browser(function (url, client_out, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url),
                {
                    max_write_size: 16,
                    highWaterMark: 100
                }),
                name = 'client_' + client_index,
                client_in = [];

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('end', function ()
            {
                cb(null, client_in);
            });

            client_duplex.on('readable', function ()
            {
                var data = this.read();

                if (data)
                {
                    client_in.push(data.toString('base64'));
                }
            });

            client_duplex.end(client_out, 'base64');
        },
        client_url,
        client_out.toString('base64'),
        null,
        function (err, client_in)
        {
            if (err) { return cb(err); }

            expect(client_in.length).to.equal(4);
            expect(server_in.length).to.equal(4);

            expect(Buffer.concat(client_in.map(function (s)
            {
                return Buffer.from(s, 'base64');
            }))).to.eql(server_out);
            expect(Buffer.concat(server_in)).to.eql(client_out);

            cb();
        });
    });

    it('should detect read overflow from client to server',
       read_overflow_client_server(get_client_duplex_name, get_server));

    it('should detect read overflow from server to client',
       read_overflow_server_client(get_client_duplex_name, get_server));

    it('should detect read overflow between client and server',
       both(read_overflow_client_server,
            read_overflow_server_client,
            get_client_duplex_name,
            get_server));

    it('should support disabling read overflow', function (cb)
    {
        primus.once('connection', function (spark2)
        {
            var spark_duplex2 = new PrimusDuplex(spark2);
            spark_duplex2.end(Buffer.alloc(100));
        });

        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url),
                {
                    check_read_overflow: false
                }),
                name = 'client_' + client_index,
                size = 0;

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.msg_stream.on('data', function ()
            {
                client_duplex.unshift(NodeBuffer.alloc(1));
            });

            client_duplex.on('end', function ()
            {
                this.end();
                cb(null, size);
            });

            client_duplex.on('readable', function ()
            {
                var data;

                while (true)
                {
                    data = this.read();

                    if (data === null)
                    {
                        break;
                    }

                    size += data.length;
                }
            });
        }, client_url, function (size, cb)
        {
            expect(size).to.equal(103);
            cb();
        }, cb);
    });

    it('should handle string data without re-encoding as base64', function (cb)
    {
        var json = JSON.stringify([4, { foo: 34.231123 }, 'hi\u1234\nthere']),
            client_done = false,
            server_done = false;

        function encode(chunk, encoding, start, end)
        {
            return encoding ? chunk.substring(start, end) :
                              chunk.toString('base64', start, end);
        }

        function decode(chunk, internal)
        {
            return internal ? Buffer.from(chunk, 'base64') : chunk;
        }

        primus.once('connection', function (spark2)
        {
            var spark_duplex2 = new PrimusDuplex(spark2,
            {
                decodeStrings: false,
                encode_data: encode,
                decode_data: decode
            });

            spark_duplex2.setEncoding('utf8');

            spark_duplex2.on('end', function ()
            {
                server_done = true;
                if (client_done) { cb(); }
            });

            spark_duplex2.msg_stream.on('data', function (data)
            {
                if (data.type === 'data')
                {
                    expect(data.data).to.equal(json);
                }
            });

            spark_duplex2.once('readable', function ()
            {
                expect(this.read()).to.equal(json);

                this.on('readable', function ()
                {
                    while (true)
                    {
                        if (!this.read()) { break; }
                    }
                });
            });

            spark_duplex2.end(json);
        });

        in_browser(function (url, json, cb)
        {
            function encode2(chunk, encoding, start, end)
            {
                return encoding ? chunk.substring(start, end) :
                                  chunk.toString('base64', start, end);
            }

            function decode2(chunk, internal)
            {
                return internal ? NodeBuffer.from(chunk, 'base64') : chunk;
            }

            var client_duplex = new PrimusDuplex(new Primus(url),
                {
                    decodeStrings: false,
                    encode_data: encode2,
                    decode_data: decode2
                }),
                name = 'client_' + client_index,
                read_data,
                msg_data;

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.setEncoding('utf8');

            client_duplex.msg_stream.on('data', function (data)
            {
                if (data.type === 'data')
                {
                    msg_data = data.data;
                }
            });

            client_duplex.on('end', function ()
            {
                this.end(json);
                cb(null, read_data, msg_data);
            });

            client_duplex.once('readable', function ()
            {
                read_data = this.read();

                this.on('readable', function ()
                {
                    while (true)
                    {
                        if (!this.read()) { break; }
                    }
                });
            });
        }, client_url, json, function (read_data, msg_data, cb)
        {
            expect(read_data).to.equal(json);
            expect(msg_data).to.equal(json);
            cb();
        }, function (err)
        {
            if (err) { cb(err); }
            client_done = true;
            if (server_done) { cb(); }
        });
    });

    it('should not write zero length data', function (cb)
    {
        in_browser(function (name, cb)
        {
            var client_duplex = client_duplexes[name],
                orig_write = client_duplex.msg_stream.write;

            client_duplex.msg_stream.write = function (data)
            {
                if (data.type === 'data')
                {
                    return cb(null, data.data.length);
                }

                orig_write.call(this, data);
            };

            client_duplex.write(NodeBuffer.alloc(0));
            client_duplex.write(NodeBuffer.alloc(1));
        }, get_client_duplex_name(), function (len, cb)
        {
            expect(len).to.be.above(0);
            cb();
        }, cb);
    });

    it('should emit an error when encoded data is not a string', function (cb)
    {
        function encode(chunk, encoding, start, end, internal)
        {
            return internal ? chunk.toString('base64', start, end) : 42;
        }

        primus.once('connection', function (spark2)
        {
            var spark_duplex2 = new PrimusDuplex(spark2,
            {
                encode_data: encode
            });

            spark_duplex2.end('hello');
        });

        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url)),
                name = 'client_' + client_index;

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('error', function (err)
            {
                this.end();
                cb(null, err.message);
            });
        }, client_url, function (msg, cb)
        {
            expect(msg).to.equal('encoded data is not a string: 42');
            cb();
        }, cb);
    });

    it('should emit an error when null data is sent before handshake', function (cb)
    {
        primus.once('connection', function (spark2)
        {
            var spark_duplex2 = new PrimusDuplex(spark2,
            {
                _delay_handshake: true
            });

            spark_duplex2.msg_stream.write(null);
            spark_duplex2.end();
        });

        in_browser(function (url, cb)
        {
            var client_duplex = new PrimusDuplex(new Primus(url)),
                name = 'client_' + client_index;

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('error', function (err)
            {
                this.end();
                cb(null, err.message);
            });
        }, client_url, function (msg, cb)
        {
            expect(msg).to.equal('invalid data: null');
            cb();
        }, cb);
    });

    it('should emit an error when null data is sent after handshake', function (cb)
    {
        in_browser(function (name, cb)
        {
            var client_duplex = client_duplexes[name];

            client_duplex.on('error', function (err)
            {
                this.end();
                this.message = err.message;
            });

            cb();
        }, get_client_duplex_name(), null, function (err)
        {
            if (err) { cb(err); }
            get_server().msg_stream.write(null);
            get_server().end();
        });

        wait_browser(function (name, cb)
        {
            var client_duplex = client_duplexes[name];
            cb(null, !!client_duplex.message, client_duplex.message);
        }, get_client_duplex_name(), function (msg, cb)
        {
            expect(msg).to.equal('invalid data: null');
            cb();
        }, cb);
    });

    it('should support not decoding data', function (cb)
    {
        primus.once('connection', function (spark2)
        {
            var spark_duplex2 = new PrimusDuplex(spark2);
            spark_duplex2.end('hello');
        });

        in_browser(function (url, cb)
        {
            var client_duplex,
                name = 'client_' + client_index,
                received,
                read_data;

            function decode(chunk, internal)
            {
                received = chunk;
                return internal ? NodeBuffer.from(chunk, 'base64') : null;
            }

            client_duplex = new PrimusDuplex(new Primus(url),
            {
                decode_data: decode
            });

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('end', function ()
            {
                this.end();
                cb(null, received, read_data);
            });

            client_duplex.on('readable', function ()
            {
                read_data = this.read();
            });
        }, client_url, function (received, read_data, cb)
        {
            expect(received).to.equal(Buffer.from('hello').toString('base64'));
            expect(read_data).to.equal(null);
            cb();
        }, cb);
    });

    it('should support not decoding status data', function (cb)
    {
        var spark_duplex2;

        primus.once('connection', function (spark2)
        {
            spark_duplex2 = new PrimusDuplex(spark2);

            spark_duplex2.on('end', function ()
            {
                this.end();
            });

            spark_duplex2.once('readable', function ()
            {
                expect(this.read().toString()).to.equal('hello');

                spark_duplex2.on('readable', function ()
                {
                    this.read();
                });
            });
        });

        in_browser(function (url, cb)
        {
            var client_duplex,
                name = 'client_' + client_index,
                received,
                intrnl;

            function decode(chunk, internal)
            {
                received = chunk;
                intrnl = internal;
                return null;
            }

            client_duplex = new PrimusDuplex(new Primus(url),
            {
                decode_data: decode
            });

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('end', function ()
            {
                cb(null, received, intrnl, this._remote_free);
            });

            client_duplex.on('readable', function ()
            {
                this.read();
            });

            client_duplex.msg_stream.on('open', function ()
            {
                client_duplex.end('hello');
            });
        }, client_url, function (received, internal, remote_free, cb)
        {
            var buf = Buffer.from(received, 'base64');
            expect(buf.readUInt32BE(0)).to.equal(5);
            expect(internal).to.equal(true);
            expect(remote_free).to.equal(spark_duplex2._readableState.highWaterMark - 5);
            cb();
        }, cb);
    });

    it('should emit an error if sequence is wrong length', function (cb)
    {
        primus.once('connection', function (spark2)
        {
            var spark_duplex2 = new PrimusDuplex(spark2);

            spark_duplex2.on('end', function ()
            {
                this.end();
            });

            spark_duplex2.once('readable', function ()
            {
                expect(this.read().toString()).to.equal('hello');

                spark_duplex2.on('readable', function ()
                {
                    this.read();
                });
            });
        });

        in_browser(function (url, cb)
        {
            var client_duplex,
                name = 'client_' + client_index,
                received,
                intrnl;

            function decode(chunk, internal)
            {
                received = chunk;
                intrnl = internal;
                var buf = NodeBuffer.from(chunk, 'base64');
                return NodeBuffer.concat([buf, NodeBuffer.alloc(1)]);
            }

            client_duplex = new PrimusDuplex(new Primus(url),
            {
                decode_data: decode
            });

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('error', function (err)
            {
                cb(null, received, intrnl, err.message);
            });

            client_duplex.msg_stream.on('open', function ()
            {
                client_duplex.end('hello');
            });
        }, client_url, function (received, internal, msg, cb)
        {
            var buf = Buffer.from(received, 'base64');
            expect(buf.length).to.equal(36);
            expect(buf.readUInt32BE(0)).to.equal(5);
            expect(internal).to.equal(true);
            expect(msg).to.equal('invalid sequence length: 37');
            cb();
        }, cb);
    });

    it('should emit an error if sequence is invalid', function (cb)
    {
        primus.once('connection', function (spark2)
        {
            var spark_duplex2 = new PrimusDuplex(spark2);

            spark_duplex2.on('end', function ()
            {
                this.end();
            });

            spark_duplex2.once('readable', function ()
            {
                expect(this.read().toString()).to.equal('hello');

                spark_duplex2.on('readable', function ()
                {
                    this.read();
                });
            });
        });

        in_browser(function (url, cb)
        {
            var client_duplex,
                name = 'client_' + client_index,
                received,
                intrnl;

            function decode(chunk, internal)
            {
                received = chunk;
                intrnl = internal;
                var buf = NodeBuffer.from(chunk, 'base64');
                buf[20] ^= 1;
                return buf;
            }

            client_duplex = new PrimusDuplex(new Primus(url),
            {
                decode_data: decode
            });

            client_index += 1;
            client_duplexes[name] = client_duplex;

            client_duplex.on('error', function (err)
            {
                cb(null, received, intrnl, err.message);
            });

            client_duplex.msg_stream.on('open', function ()
            {
                client_duplex.end('hello');
            });
        }, client_url, function (received, internal, msg, cb)
        {
            var buf = Buffer.from(received, 'base64');
            expect(buf.length).to.equal(36);
            expect(buf.readUInt32BE(0)).to.equal(5);
            expect(internal).to.equal(true);
            expect(msg).to.equal('invalid sequence signature');
            cb();
        }, cb);
    });

    it('should wrap sequence numbers', function (cb)
    {
        get_server().once('readable', function ()
        {
            expect(this.read().toString()).to.equal('hel');

            this.once('readable', function ()
            {
                expect(this.read().toString()).to.equal('lo there');
                expect(this.read()).to.equal(null);
                this.end();
            });

            in_browser(function (name, cb)
            {
                var client_duplex = client_duplexes[name];

                client_duplex.on('end', function ()
                {
                    window._remote_frees.push(this._remote_free);
                    window._seqs.push(this._seq);
                    cb(null, window.lengths, window.seqs, window._seqs, window._remote_frees);
                });

                client_duplex.end('lo there');
            }, get_client_duplex_name(), function (lengths, seqs, _seqs, _remote_frees, cb)
            {
                expect(lengths).to.eql([36, 36]);
                expect(seqs).to.eql([Math.pow(2, 32) - 4 + 3, 7]);
                expect(_seqs).to.eql([Math.pow(2, 32) - 4 + 3, 7, 7]);
                expect(_remote_frees).to.eql([97, 92, 100]);
                cb();
            }, cb);
        });

        in_browser(function (name, cb)
        {
            window.lengths = [];
            window.seqs = [];
            window._seqs = [];
            window._remote_frees = [];

            var client_duplex = client_duplexes[name];

            client_duplex._decode_data = function (chunk, internal)
            {
                var buf = NodeBuffer.from(chunk, 'base64');
                window.lengths.push(buf.length);
                window.seqs.push(buf.readUInt32BE(0));
                window._seqs.push(this._seq);
                window._remote_frees.push(this._remote_free);
                return buf;
            };

            client_duplex._seq = Math.pow(2, 32) - 4;

            client_duplex.on('readable', function ()
            {
                this.read();
            });

            client_duplex.write('hel', cb);
        }, get_client_duplex_name(), null, function () {});
    });

    it.only('should support reading and writing more than the high-water mark', function (cb)
    {
        var buf = crypto.randomBytes(150);

        in_browser(function (name, cb)
        {
            var client_duplex = client_duplexes[name];

            client_duplex._reads = [];

            client_duplex.on('end', function ()
            {
                this.end();
            });

            client_duplex.once('readable', function ()
            {
                this.once('readable', function ()
                {
                    this._reads.push(this.read(150).toString('hex'));
                    this._reads.push(this.read());
                });

                this._reads.push(this.read(150));
            });

            cb();
        }, get_client_duplex_name(), null, function (err)
        {
            if (err) { return cb(err); }

            get_server().on('end', function ()
            {
                // Node.js raises the hwm to next power of 2 after a read
                expect(this._remote_free).to.equal(256);

                in_browser(function (name, cb)
                {
                    var client_duplex = client_duplexes[name];
                    cb(null, client_duplex._reads, client_duplex._readableState.highWaterMark);

                }, get_client_duplex_name(), function (reads, hwm, cb)
                {
                    expect(reads).to.eql([null, buf.toString('hex'), null]);
                    expect(hwm).to.equal(256);
                    cb();
                }, cb);
            });

            get_server().on('readable', function ()
            {
                this.read();
            });

            get_server().end(buf);
        });
    });
});

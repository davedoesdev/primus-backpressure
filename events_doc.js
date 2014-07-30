/*global PrimusDuplex */
/*jslint node: true */
"use strict";

/**
`handshake` event

A `PrimusDuplex` object emits a `handshake` event when it has exchanged a handshake message with its peer.

If you passed `initiate_handshake` as `true` when [constructing](#PrimusDuplex) a `PrimusDuplex` object then you can [`write`](#write) to it before `handshake` is emitted. Otherwise, you should wait for `handshake`. The reason is that the first message a `PrimusDuplex` object must receive is a handshake.

You might find it simplest on both sides of a connection just to wait for `handshake` before starting to write data.
*/
PrimusDuplex.events.handshake = function () { return undefined; };

# Source references and notices

This project implements the revision 634 protocol exposed by GregHib/Void and uses its Kotlin server encoders, cache decoders and client packet-size metadata as references. `src/core/protocol.ts` contains extracted packet sizes from `void-client/src/commonMain/kotlin/InboundPacketHeader.kt`.

`test/fixtures/platform-loop.js.kt` preserves the matching Void client platform loop as a patch-validation fixture; the license notice below applies.

Reference repositories:

- https://github.com/GregHib/void
- https://github.com/GregHib/void-client

The local Void server checkout inspected during initial implementation was commit `aa566b0d0b21efa59d816e78e181c1a6ce5dffc7`. No code from RuneJS or rs-sdk is included in this project.

BSD 3-Clause License

Copyright (c) 2021, Greg Hibberd
Copyright (c) 2021, GregHib
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

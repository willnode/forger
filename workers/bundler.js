var bundler = (function (exports) {
  'use strict';

  var global$1 = (typeof global !== "undefined" ? global :
    typeof self !== "undefined" ? self :
    typeof window !== "undefined" ? window : {});

  var lookup = [];
  var revLookup = [];
  var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
  var inited = false;
  function init () {
    inited = true;
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }

    revLookup['-'.charCodeAt(0)] = 62;
    revLookup['_'.charCodeAt(0)] = 63;
  }

  function toByteArray (b64) {
    if (!inited) {
      init();
    }
    var i, j, l, tmp, placeHolders, arr;
    var len = b64.length;

    if (len % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

    // the number of equal signs (place holders)
    // if there are two placeholders, than the two characters before it
    // represent one byte
    // if there is only one, then the three characters before it represent 2 bytes
    // this is just a cheap hack to not do indexOf twice
    placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

    // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(len * 3 / 4 - placeHolders);

    // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? len - 4 : len;

    var L = 0;

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
      arr[L++] = (tmp >> 16) & 0xFF;
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    if (placeHolders === 2) {
      tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
      arr[L++] = tmp & 0xFF;
    } else if (placeHolders === 1) {
      tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    return arr
  }

  function tripletToBase64 (num) {
    return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
  }

  function encodeChunk (uint8, start, end) {
    var tmp;
    var output = [];
    for (var i = start; i < end; i += 3) {
      tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
      output.push(tripletToBase64(tmp));
    }
    return output.join('')
  }

  function fromByteArray (uint8) {
    if (!inited) {
      init();
    }
    var tmp;
    var len = uint8.length;
    var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
    var output = '';
    var parts = [];
    var maxChunkLength = 16383; // must be multiple of 3

    // go through the array every three bytes, we'll deal with trailing stuff later
    for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
      parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
    }

    // pad the end with zeros, but make sure to not forget the extra bytes
    if (extraBytes === 1) {
      tmp = uint8[len - 1];
      output += lookup[tmp >> 2];
      output += lookup[(tmp << 4) & 0x3F];
      output += '==';
    } else if (extraBytes === 2) {
      tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
      output += lookup[tmp >> 10];
      output += lookup[(tmp >> 4) & 0x3F];
      output += lookup[(tmp << 2) & 0x3F];
      output += '=';
    }

    parts.push(output);

    return parts.join('')
  }

  function read (buffer, offset, isLE, mLen, nBytes) {
    var e, m;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var nBits = -7;
    var i = isLE ? (nBytes - 1) : 0;
    var d = isLE ? -1 : 1;
    var s = buffer[offset + i];

    i += d;

    e = s & ((1 << (-nBits)) - 1);
    s >>= (-nBits);
    nBits += eLen;
    for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    m = e & ((1 << (-nBits)) - 1);
    e >>= (-nBits);
    nBits += mLen;
    for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    if (e === 0) {
      e = 1 - eBias;
    } else if (e === eMax) {
      return m ? NaN : ((s ? -1 : 1) * Infinity)
    } else {
      m = m + Math.pow(2, mLen);
      e = e - eBias;
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
  }

  function write (buffer, value, offset, isLE, mLen, nBytes) {
    var e, m, c;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
    var i = isLE ? 0 : (nBytes - 1);
    var d = isLE ? 1 : -1;
    var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

    value = Math.abs(value);

    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(value) / Math.LN2);
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--;
        c *= 2;
      }
      if (e + eBias >= 1) {
        value += rt / c;
      } else {
        value += rt * Math.pow(2, 1 - eBias);
      }
      if (value * c >= 2) {
        e++;
        c /= 2;
      }

      if (e + eBias >= eMax) {
        m = 0;
        e = eMax;
      } else if (e + eBias >= 1) {
        m = (value * c - 1) * Math.pow(2, mLen);
        e = e + eBias;
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
        e = 0;
      }
    }

    for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

    e = (e << mLen) | m;
    eLen += mLen;
    for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

    buffer[offset + i - d] |= s * 128;
  }

  var toString$1 = {}.toString;

  var isArray$1 = Array.isArray || function (arr) {
    return toString$1.call(arr) == '[object Array]';
  };

  /*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
   * @license  MIT
   */

  var INSPECT_MAX_BYTES = 50;

  /**
   * If `Buffer.TYPED_ARRAY_SUPPORT`:
   *   === true    Use Uint8Array implementation (fastest)
   *   === false   Use Object implementation (most compatible, even IE6)
   *
   * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
   * Opera 11.6+, iOS 4.2+.
   *
   * Due to various browser bugs, sometimes the Object implementation will be used even
   * when the browser supports typed arrays.
   *
   * Note:
   *
   *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
   *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
   *
   *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
   *
   *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
   *     incorrect length in some situations.

   * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
   * get the Object implementation, which is slower but behaves correctly.
   */
  Buffer.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
    ? global$1.TYPED_ARRAY_SUPPORT
    : true;

  /*
   * Export kMaxLength after typed array support is determined.
   */
  kMaxLength();

  function kMaxLength () {
    return Buffer.TYPED_ARRAY_SUPPORT
      ? 0x7fffffff
      : 0x3fffffff
  }

  function createBuffer (that, length) {
    if (kMaxLength() < length) {
      throw new RangeError('Invalid typed array length')
    }
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = new Uint8Array(length);
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      if (that === null) {
        that = new Buffer(length);
      }
      that.length = length;
    }

    return that
  }

  /**
   * The Buffer constructor returns instances of `Uint8Array` that have their
   * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
   * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
   * and the `Uint8Array` methods. Square bracket notation works as expected -- it
   * returns a single octet.
   *
   * The `Uint8Array` prototype remains unmodified.
   */

  function Buffer (arg, encodingOrOffset, length) {
    if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
      return new Buffer(arg, encodingOrOffset, length)
    }

    // Common case.
    if (typeof arg === 'number') {
      if (typeof encodingOrOffset === 'string') {
        throw new Error(
          'If encoding is specified then the first argument must be a string'
        )
      }
      return allocUnsafe(this, arg)
    }
    return from(this, arg, encodingOrOffset, length)
  }

  Buffer.poolSize = 8192; // not used by this implementation

  // TODO: Legacy, not needed anymore. Remove in next major version.
  Buffer._augment = function (arr) {
    arr.__proto__ = Buffer.prototype;
    return arr
  };

  function from (that, value, encodingOrOffset, length) {
    if (typeof value === 'number') {
      throw new TypeError('"value" argument must not be a number')
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return fromArrayBuffer(that, value, encodingOrOffset, length)
    }

    if (typeof value === 'string') {
      return fromString(that, value, encodingOrOffset)
    }

    return fromObject(that, value)
  }

  /**
   * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
   * if value is a number.
   * Buffer.from(str[, encoding])
   * Buffer.from(array)
   * Buffer.from(buffer)
   * Buffer.from(arrayBuffer[, byteOffset[, length]])
   **/
  Buffer.from = function (value, encodingOrOffset, length) {
    return from(null, value, encodingOrOffset, length)
  };

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    Buffer.prototype.__proto__ = Uint8Array.prototype;
    Buffer.__proto__ = Uint8Array;
  }

  function assertSize (size) {
    if (typeof size !== 'number') {
      throw new TypeError('"size" argument must be a number')
    } else if (size < 0) {
      throw new RangeError('"size" argument must not be negative')
    }
  }

  function alloc (that, size, fill, encoding) {
    assertSize(size);
    if (size <= 0) {
      return createBuffer(that, size)
    }
    if (fill !== undefined) {
      // Only pay attention to encoding if it's a string. This
      // prevents accidentally sending in a number that would
      // be interpretted as a start offset.
      return typeof encoding === 'string'
        ? createBuffer(that, size).fill(fill, encoding)
        : createBuffer(that, size).fill(fill)
    }
    return createBuffer(that, size)
  }

  /**
   * Creates a new filled Buffer instance.
   * alloc(size[, fill[, encoding]])
   **/
  Buffer.alloc = function (size, fill, encoding) {
    return alloc(null, size, fill, encoding)
  };

  function allocUnsafe (that, size) {
    assertSize(size);
    that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
    if (!Buffer.TYPED_ARRAY_SUPPORT) {
      for (var i = 0; i < size; ++i) {
        that[i] = 0;
      }
    }
    return that
  }

  /**
   * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
   * */
  Buffer.allocUnsafe = function (size) {
    return allocUnsafe(null, size)
  };
  /**
   * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
   */
  Buffer.allocUnsafeSlow = function (size) {
    return allocUnsafe(null, size)
  };

  function fromString (that, string, encoding) {
    if (typeof encoding !== 'string' || encoding === '') {
      encoding = 'utf8';
    }

    if (!Buffer.isEncoding(encoding)) {
      throw new TypeError('"encoding" must be a valid string encoding')
    }

    var length = byteLength(string, encoding) | 0;
    that = createBuffer(that, length);

    var actual = that.write(string, encoding);

    if (actual !== length) {
      // Writing a hex string, for example, that contains invalid characters will
      // cause everything after the first invalid character to be ignored. (e.g.
      // 'abxxcd' will be treated as 'ab')
      that = that.slice(0, actual);
    }

    return that
  }

  function fromArrayLike (that, array) {
    var length = array.length < 0 ? 0 : checked(array.length) | 0;
    that = createBuffer(that, length);
    for (var i = 0; i < length; i += 1) {
      that[i] = array[i] & 255;
    }
    return that
  }

  function fromArrayBuffer (that, array, byteOffset, length) {
    array.byteLength; // this throws if `array` is not a valid ArrayBuffer

    if (byteOffset < 0 || array.byteLength < byteOffset) {
      throw new RangeError('\'offset\' is out of bounds')
    }

    if (array.byteLength < byteOffset + (length || 0)) {
      throw new RangeError('\'length\' is out of bounds')
    }

    if (byteOffset === undefined && length === undefined) {
      array = new Uint8Array(array);
    } else if (length === undefined) {
      array = new Uint8Array(array, byteOffset);
    } else {
      array = new Uint8Array(array, byteOffset, length);
    }

    if (Buffer.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = array;
      that.__proto__ = Buffer.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      that = fromArrayLike(that, array);
    }
    return that
  }

  function fromObject (that, obj) {
    if (internalIsBuffer(obj)) {
      var len = checked(obj.length) | 0;
      that = createBuffer(that, len);

      if (that.length === 0) {
        return that
      }

      obj.copy(that, 0, 0, len);
      return that
    }

    if (obj) {
      if ((typeof ArrayBuffer !== 'undefined' &&
          obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
        if (typeof obj.length !== 'number' || isnan(obj.length)) {
          return createBuffer(that, 0)
        }
        return fromArrayLike(that, obj)
      }

      if (obj.type === 'Buffer' && isArray$1(obj.data)) {
        return fromArrayLike(that, obj.data)
      }
    }

    throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
  }

  function checked (length) {
    // Note: cannot use `length < kMaxLength()` here because that fails when
    // length is NaN (which is otherwise coerced to zero.)
    if (length >= kMaxLength()) {
      throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                           'size: 0x' + kMaxLength().toString(16) + ' bytes')
    }
    return length | 0
  }
  Buffer.isBuffer = isBuffer;
  function internalIsBuffer (b) {
    return !!(b != null && b._isBuffer)
  }

  Buffer.compare = function compare (a, b) {
    if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
      throw new TypeError('Arguments must be Buffers')
    }

    if (a === b) return 0

    var x = a.length;
    var y = b.length;

    for (var i = 0, len = Math.min(x, y); i < len; ++i) {
      if (a[i] !== b[i]) {
        x = a[i];
        y = b[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  Buffer.isEncoding = function isEncoding (encoding) {
    switch (String(encoding).toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'latin1':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return true
      default:
        return false
    }
  };

  Buffer.concat = function concat (list, length) {
    if (!isArray$1(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }

    if (list.length === 0) {
      return Buffer.alloc(0)
    }

    var i;
    if (length === undefined) {
      length = 0;
      for (i = 0; i < list.length; ++i) {
        length += list[i].length;
      }
    }

    var buffer = Buffer.allocUnsafe(length);
    var pos = 0;
    for (i = 0; i < list.length; ++i) {
      var buf = list[i];
      if (!internalIsBuffer(buf)) {
        throw new TypeError('"list" argument must be an Array of Buffers')
      }
      buf.copy(buffer, pos);
      pos += buf.length;
    }
    return buffer
  };

  function byteLength (string, encoding) {
    if (internalIsBuffer(string)) {
      return string.length
    }
    if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
        (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
      return string.byteLength
    }
    if (typeof string !== 'string') {
      string = '' + string;
    }

    var len = string.length;
    if (len === 0) return 0

    // Use a for loop to avoid recursion
    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'ascii':
        case 'latin1':
        case 'binary':
          return len
        case 'utf8':
        case 'utf-8':
        case undefined:
          return utf8ToBytes(string).length
        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return len * 2
        case 'hex':
          return len >>> 1
        case 'base64':
          return base64ToBytes(string).length
        default:
          if (loweredCase) return utf8ToBytes(string).length // assume utf8
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  }
  Buffer.byteLength = byteLength;

  function slowToString (encoding, start, end) {
    var loweredCase = false;

    // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
    // property of a typed array.

    // This behaves neither like String nor Uint8Array in that we set start/end
    // to their upper/lower bounds if the value passed is out of range.
    // undefined is handled specially as per ECMA-262 6th Edition,
    // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
    if (start === undefined || start < 0) {
      start = 0;
    }
    // Return early if start > this.length. Done here to prevent potential uint32
    // coercion fail below.
    if (start > this.length) {
      return ''
    }

    if (end === undefined || end > this.length) {
      end = this.length;
    }

    if (end <= 0) {
      return ''
    }

    // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
    end >>>= 0;
    start >>>= 0;

    if (end <= start) {
      return ''
    }

    if (!encoding) encoding = 'utf8';

    while (true) {
      switch (encoding) {
        case 'hex':
          return hexSlice(this, start, end)

        case 'utf8':
        case 'utf-8':
          return utf8Slice(this, start, end)

        case 'ascii':
          return asciiSlice(this, start, end)

        case 'latin1':
        case 'binary':
          return latin1Slice(this, start, end)

        case 'base64':
          return base64Slice(this, start, end)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return utf16leSlice(this, start, end)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = (encoding + '').toLowerCase();
          loweredCase = true;
      }
    }
  }

  // The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
  // Buffer instances.
  Buffer.prototype._isBuffer = true;

  function swap (b, n, m) {
    var i = b[n];
    b[n] = b[m];
    b[m] = i;
  }

  Buffer.prototype.swap16 = function swap16 () {
    var len = this.length;
    if (len % 2 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 16-bits')
    }
    for (var i = 0; i < len; i += 2) {
      swap(this, i, i + 1);
    }
    return this
  };

  Buffer.prototype.swap32 = function swap32 () {
    var len = this.length;
    if (len % 4 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 32-bits')
    }
    for (var i = 0; i < len; i += 4) {
      swap(this, i, i + 3);
      swap(this, i + 1, i + 2);
    }
    return this
  };

  Buffer.prototype.swap64 = function swap64 () {
    var len = this.length;
    if (len % 8 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 64-bits')
    }
    for (var i = 0; i < len; i += 8) {
      swap(this, i, i + 7);
      swap(this, i + 1, i + 6);
      swap(this, i + 2, i + 5);
      swap(this, i + 3, i + 4);
    }
    return this
  };

  Buffer.prototype.toString = function toString () {
    var length = this.length | 0;
    if (length === 0) return ''
    if (arguments.length === 0) return utf8Slice(this, 0, length)
    return slowToString.apply(this, arguments)
  };

  Buffer.prototype.equals = function equals (b) {
    if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
    if (this === b) return true
    return Buffer.compare(this, b) === 0
  };

  Buffer.prototype.inspect = function inspect () {
    var str = '';
    var max = INSPECT_MAX_BYTES;
    if (this.length > 0) {
      str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
      if (this.length > max) str += ' ... ';
    }
    return '<Buffer ' + str + '>'
  };

  Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
    if (!internalIsBuffer(target)) {
      throw new TypeError('Argument must be a Buffer')
    }

    if (start === undefined) {
      start = 0;
    }
    if (end === undefined) {
      end = target ? target.length : 0;
    }
    if (thisStart === undefined) {
      thisStart = 0;
    }
    if (thisEnd === undefined) {
      thisEnd = this.length;
    }

    if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
      throw new RangeError('out of range index')
    }

    if (thisStart >= thisEnd && start >= end) {
      return 0
    }
    if (thisStart >= thisEnd) {
      return -1
    }
    if (start >= end) {
      return 1
    }

    start >>>= 0;
    end >>>= 0;
    thisStart >>>= 0;
    thisEnd >>>= 0;

    if (this === target) return 0

    var x = thisEnd - thisStart;
    var y = end - start;
    var len = Math.min(x, y);

    var thisCopy = this.slice(thisStart, thisEnd);
    var targetCopy = target.slice(start, end);

    for (var i = 0; i < len; ++i) {
      if (thisCopy[i] !== targetCopy[i]) {
        x = thisCopy[i];
        y = targetCopy[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  // Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
  // OR the last index of `val` in `buffer` at offset <= `byteOffset`.
  //
  // Arguments:
  // - buffer - a Buffer to search
  // - val - a string, Buffer, or number
  // - byteOffset - an index into `buffer`; will be clamped to an int32
  // - encoding - an optional encoding, relevant is val is a string
  // - dir - true for indexOf, false for lastIndexOf
  function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
    // Empty buffer means no match
    if (buffer.length === 0) return -1

    // Normalize byteOffset
    if (typeof byteOffset === 'string') {
      encoding = byteOffset;
      byteOffset = 0;
    } else if (byteOffset > 0x7fffffff) {
      byteOffset = 0x7fffffff;
    } else if (byteOffset < -0x80000000) {
      byteOffset = -0x80000000;
    }
    byteOffset = +byteOffset;  // Coerce to Number.
    if (isNaN(byteOffset)) {
      // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
      byteOffset = dir ? 0 : (buffer.length - 1);
    }

    // Normalize byteOffset: negative offsets start from the end of the buffer
    if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
    if (byteOffset >= buffer.length) {
      if (dir) return -1
      else byteOffset = buffer.length - 1;
    } else if (byteOffset < 0) {
      if (dir) byteOffset = 0;
      else return -1
    }

    // Normalize val
    if (typeof val === 'string') {
      val = Buffer.from(val, encoding);
    }

    // Finally, search either indexOf (if dir is true) or lastIndexOf
    if (internalIsBuffer(val)) {
      // Special case: looking for empty string/buffer always fails
      if (val.length === 0) {
        return -1
      }
      return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
    } else if (typeof val === 'number') {
      val = val & 0xFF; // Search for a byte value [0-255]
      if (Buffer.TYPED_ARRAY_SUPPORT &&
          typeof Uint8Array.prototype.indexOf === 'function') {
        if (dir) {
          return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
        } else {
          return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
        }
      }
      return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
    }

    throw new TypeError('val must be string, number or Buffer')
  }

  function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
    var indexSize = 1;
    var arrLength = arr.length;
    var valLength = val.length;

    if (encoding !== undefined) {
      encoding = String(encoding).toLowerCase();
      if (encoding === 'ucs2' || encoding === 'ucs-2' ||
          encoding === 'utf16le' || encoding === 'utf-16le') {
        if (arr.length < 2 || val.length < 2) {
          return -1
        }
        indexSize = 2;
        arrLength /= 2;
        valLength /= 2;
        byteOffset /= 2;
      }
    }

    function read (buf, i) {
      if (indexSize === 1) {
        return buf[i]
      } else {
        return buf.readUInt16BE(i * indexSize)
      }
    }

    var i;
    if (dir) {
      var foundIndex = -1;
      for (i = byteOffset; i < arrLength; i++) {
        if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
          if (foundIndex === -1) foundIndex = i;
          if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
        } else {
          if (foundIndex !== -1) i -= i - foundIndex;
          foundIndex = -1;
        }
      }
    } else {
      if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
      for (i = byteOffset; i >= 0; i--) {
        var found = true;
        for (var j = 0; j < valLength; j++) {
          if (read(arr, i + j) !== read(val, j)) {
            found = false;
            break
          }
        }
        if (found) return i
      }
    }

    return -1
  }

  Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
    return this.indexOf(val, byteOffset, encoding) !== -1
  };

  Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
  };

  Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
  };

  function hexWrite (buf, string, offset, length) {
    offset = Number(offset) || 0;
    var remaining = buf.length - offset;
    if (!length) {
      length = remaining;
    } else {
      length = Number(length);
      if (length > remaining) {
        length = remaining;
      }
    }

    // must be an even number of digits
    var strLen = string.length;
    if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

    if (length > strLen / 2) {
      length = strLen / 2;
    }
    for (var i = 0; i < length; ++i) {
      var parsed = parseInt(string.substr(i * 2, 2), 16);
      if (isNaN(parsed)) return i
      buf[offset + i] = parsed;
    }
    return i
  }

  function utf8Write (buf, string, offset, length) {
    return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  }

  function asciiWrite (buf, string, offset, length) {
    return blitBuffer(asciiToBytes(string), buf, offset, length)
  }

  function latin1Write (buf, string, offset, length) {
    return asciiWrite(buf, string, offset, length)
  }

  function base64Write (buf, string, offset, length) {
    return blitBuffer(base64ToBytes(string), buf, offset, length)
  }

  function ucs2Write (buf, string, offset, length) {
    return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  }

  Buffer.prototype.write = function write (string, offset, length, encoding) {
    // Buffer#write(string)
    if (offset === undefined) {
      encoding = 'utf8';
      length = this.length;
      offset = 0;
    // Buffer#write(string, encoding)
    } else if (length === undefined && typeof offset === 'string') {
      encoding = offset;
      length = this.length;
      offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
    } else if (isFinite(offset)) {
      offset = offset | 0;
      if (isFinite(length)) {
        length = length | 0;
        if (encoding === undefined) encoding = 'utf8';
      } else {
        encoding = length;
        length = undefined;
      }
    // legacy write(string, encoding, offset, length) - remove in v0.13
    } else {
      throw new Error(
        'Buffer.write(string, encoding, offset[, length]) is no longer supported'
      )
    }

    var remaining = this.length - offset;
    if (length === undefined || length > remaining) length = remaining;

    if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
      throw new RangeError('Attempt to write outside buffer bounds')
    }

    if (!encoding) encoding = 'utf8';

    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'hex':
          return hexWrite(this, string, offset, length)

        case 'utf8':
        case 'utf-8':
          return utf8Write(this, string, offset, length)

        case 'ascii':
          return asciiWrite(this, string, offset, length)

        case 'latin1':
        case 'binary':
          return latin1Write(this, string, offset, length)

        case 'base64':
          // Warning: maxLength not taken into account in base64Write
          return base64Write(this, string, offset, length)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return ucs2Write(this, string, offset, length)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  };

  Buffer.prototype.toJSON = function toJSON () {
    return {
      type: 'Buffer',
      data: Array.prototype.slice.call(this._arr || this, 0)
    }
  };

  function base64Slice (buf, start, end) {
    if (start === 0 && end === buf.length) {
      return fromByteArray(buf)
    } else {
      return fromByteArray(buf.slice(start, end))
    }
  }

  function utf8Slice (buf, start, end) {
    end = Math.min(buf.length, end);
    var res = [];

    var i = start;
    while (i < end) {
      var firstByte = buf[i];
      var codePoint = null;
      var bytesPerSequence = (firstByte > 0xEF) ? 4
        : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
        : 1;

      if (i + bytesPerSequence <= end) {
        var secondByte, thirdByte, fourthByte, tempCodePoint;

        switch (bytesPerSequence) {
          case 1:
            if (firstByte < 0x80) {
              codePoint = firstByte;
            }
            break
          case 2:
            secondByte = buf[i + 1];
            if ((secondByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
              if (tempCodePoint > 0x7F) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 3:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
              if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 4:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            fourthByte = buf[i + 3];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
              if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
                codePoint = tempCodePoint;
              }
            }
        }
      }

      if (codePoint === null) {
        // we did not generate a valid codePoint so insert a
        // replacement char (U+FFFD) and advance only 1 byte
        codePoint = 0xFFFD;
        bytesPerSequence = 1;
      } else if (codePoint > 0xFFFF) {
        // encode to utf16 (surrogate pair dance)
        codePoint -= 0x10000;
        res.push(codePoint >>> 10 & 0x3FF | 0xD800);
        codePoint = 0xDC00 | codePoint & 0x3FF;
      }

      res.push(codePoint);
      i += bytesPerSequence;
    }

    return decodeCodePointsArray(res)
  }

  // Based on http://stackoverflow.com/a/22747272/680742, the browser with
  // the lowest limit is Chrome, with 0x10000 args.
  // We go 1 magnitude less, for safety
  var MAX_ARGUMENTS_LENGTH = 0x1000;

  function decodeCodePointsArray (codePoints) {
    var len = codePoints.length;
    if (len <= MAX_ARGUMENTS_LENGTH) {
      return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
    }

    // Decode in chunks to avoid "call stack size exceeded".
    var res = '';
    var i = 0;
    while (i < len) {
      res += String.fromCharCode.apply(
        String,
        codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
      );
    }
    return res
  }

  function asciiSlice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i] & 0x7F);
    }
    return ret
  }

  function latin1Slice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i]);
    }
    return ret
  }

  function hexSlice (buf, start, end) {
    var len = buf.length;

    if (!start || start < 0) start = 0;
    if (!end || end < 0 || end > len) end = len;

    var out = '';
    for (var i = start; i < end; ++i) {
      out += toHex(buf[i]);
    }
    return out
  }

  function utf16leSlice (buf, start, end) {
    var bytes = buf.slice(start, end);
    var res = '';
    for (var i = 0; i < bytes.length; i += 2) {
      res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
    }
    return res
  }

  Buffer.prototype.slice = function slice (start, end) {
    var len = this.length;
    start = ~~start;
    end = end === undefined ? len : ~~end;

    if (start < 0) {
      start += len;
      if (start < 0) start = 0;
    } else if (start > len) {
      start = len;
    }

    if (end < 0) {
      end += len;
      if (end < 0) end = 0;
    } else if (end > len) {
      end = len;
    }

    if (end < start) end = start;

    var newBuf;
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      newBuf = this.subarray(start, end);
      newBuf.__proto__ = Buffer.prototype;
    } else {
      var sliceLen = end - start;
      newBuf = new Buffer(sliceLen, undefined);
      for (var i = 0; i < sliceLen; ++i) {
        newBuf[i] = this[i + start];
      }
    }

    return newBuf
  };

  /*
   * Need to make sure that buffer isn't trying to write out of bounds.
   */
  function checkOffset (offset, ext, length) {
    if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
    if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
  }

  Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }

    return val
  };

  Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      checkOffset(offset, byteLength, this.length);
    }

    var val = this[offset + --byteLength];
    var mul = 1;
    while (byteLength > 0 && (mul *= 0x100)) {
      val += this[offset + --byteLength] * mul;
    }

    return val
  };

  Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    return this[offset]
  };

  Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return this[offset] | (this[offset + 1] << 8)
  };

  Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return (this[offset] << 8) | this[offset + 1]
  };

  Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return ((this[offset]) |
        (this[offset + 1] << 8) |
        (this[offset + 2] << 16)) +
        (this[offset + 3] * 0x1000000)
  };

  Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
  };

  Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var i = byteLength;
    var mul = 1;
    var val = this[offset + --i];
    while (i > 0 && (mul *= 0x100)) {
      val += this[offset + --i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    if (!(this[offset] & 0x80)) return (this[offset])
    return ((0xff - this[offset] + 1) * -1)
  };

  Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset] | (this[offset + 1] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset + 1] | (this[offset] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
  };

  Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
  };

  Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, true, 23, 4)
  };

  Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, false, 23, 4)
  };

  Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, true, 52, 8)
  };

  Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, false, 52, 8)
  };

  function checkInt (buf, value, offset, ext, max, min) {
    if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
    if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
  }

  Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var mul = 1;
    var i = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var i = byteLength - 1;
    var mul = 1;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
    if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    this[offset] = (value & 0xff);
    return offset + 1
  };

  function objectWriteUInt16 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
      buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
        (littleEndian ? i : 1 - i) * 8;
    }
  }

  Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  function objectWriteUInt32 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffffffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
      buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
    }
  }

  Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset + 3] = (value >>> 24);
      this[offset + 2] = (value >>> 16);
      this[offset + 1] = (value >>> 8);
      this[offset] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = 0;
    var mul = 1;
    var sub = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = byteLength - 1;
    var mul = 1;
    var sub = 0;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
    if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    if (value < 0) value = 0xff + value + 1;
    this[offset] = (value & 0xff);
    return offset + 1
  };

  Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
      this[offset + 2] = (value >>> 16);
      this[offset + 3] = (value >>> 24);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    if (value < 0) value = 0xffffffff + value + 1;
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  function checkIEEE754 (buf, value, offset, ext, max, min) {
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
    if (offset < 0) throw new RangeError('Index out of range')
  }

  function writeFloat (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 4);
    }
    write(buf, value, offset, littleEndian, 23, 4);
    return offset + 4
  }

  Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
    return writeFloat(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
    return writeFloat(this, value, offset, false, noAssert)
  };

  function writeDouble (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 8);
    }
    write(buf, value, offset, littleEndian, 52, 8);
    return offset + 8
  }

  Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
    return writeDouble(this, value, offset, true, noAssert)
  };

  Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
    return writeDouble(this, value, offset, false, noAssert)
  };

  // copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
  Buffer.prototype.copy = function copy (target, targetStart, start, end) {
    if (!start) start = 0;
    if (!end && end !== 0) end = this.length;
    if (targetStart >= target.length) targetStart = target.length;
    if (!targetStart) targetStart = 0;
    if (end > 0 && end < start) end = start;

    // Copy 0 bytes; we're done
    if (end === start) return 0
    if (target.length === 0 || this.length === 0) return 0

    // Fatal error conditions
    if (targetStart < 0) {
      throw new RangeError('targetStart out of bounds')
    }
    if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
    if (end < 0) throw new RangeError('sourceEnd out of bounds')

    // Are we oob?
    if (end > this.length) end = this.length;
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start;
    }

    var len = end - start;
    var i;

    if (this === target && start < targetStart && targetStart < end) {
      // descending copy from end
      for (i = len - 1; i >= 0; --i) {
        target[i + targetStart] = this[i + start];
      }
    } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
      // ascending copy from start
      for (i = 0; i < len; ++i) {
        target[i + targetStart] = this[i + start];
      }
    } else {
      Uint8Array.prototype.set.call(
        target,
        this.subarray(start, start + len),
        targetStart
      );
    }

    return len
  };

  // Usage:
  //    buffer.fill(number[, offset[, end]])
  //    buffer.fill(buffer[, offset[, end]])
  //    buffer.fill(string[, offset[, end]][, encoding])
  Buffer.prototype.fill = function fill (val, start, end, encoding) {
    // Handle string cases:
    if (typeof val === 'string') {
      if (typeof start === 'string') {
        encoding = start;
        start = 0;
        end = this.length;
      } else if (typeof end === 'string') {
        encoding = end;
        end = this.length;
      }
      if (val.length === 1) {
        var code = val.charCodeAt(0);
        if (code < 256) {
          val = code;
        }
      }
      if (encoding !== undefined && typeof encoding !== 'string') {
        throw new TypeError('encoding must be a string')
      }
      if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
        throw new TypeError('Unknown encoding: ' + encoding)
      }
    } else if (typeof val === 'number') {
      val = val & 255;
    }

    // Invalid ranges are not set to a default, so can range check early.
    if (start < 0 || this.length < start || this.length < end) {
      throw new RangeError('Out of range index')
    }

    if (end <= start) {
      return this
    }

    start = start >>> 0;
    end = end === undefined ? this.length : end >>> 0;

    if (!val) val = 0;

    var i;
    if (typeof val === 'number') {
      for (i = start; i < end; ++i) {
        this[i] = val;
      }
    } else {
      var bytes = internalIsBuffer(val)
        ? val
        : utf8ToBytes(new Buffer(val, encoding).toString());
      var len = bytes.length;
      for (i = 0; i < end - start; ++i) {
        this[i + start] = bytes[i % len];
      }
    }

    return this
  };

  // HELPER FUNCTIONS
  // ================

  var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

  function base64clean (str) {
    // Node strips out invalid characters like \n and \t from the string, base64-js does not
    str = stringtrim(str).replace(INVALID_BASE64_RE, '');
    // Node converts strings with length < 2 to ''
    if (str.length < 2) return ''
    // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
    while (str.length % 4 !== 0) {
      str = str + '=';
    }
    return str
  }

  function stringtrim (str) {
    if (str.trim) return str.trim()
    return str.replace(/^\s+|\s+$/g, '')
  }

  function toHex (n) {
    if (n < 16) return '0' + n.toString(16)
    return n.toString(16)
  }

  function utf8ToBytes (string, units) {
    units = units || Infinity;
    var codePoint;
    var length = string.length;
    var leadSurrogate = null;
    var bytes = [];

    for (var i = 0; i < length; ++i) {
      codePoint = string.charCodeAt(i);

      // is surrogate component
      if (codePoint > 0xD7FF && codePoint < 0xE000) {
        // last char was a lead
        if (!leadSurrogate) {
          // no lead yet
          if (codePoint > 0xDBFF) {
            // unexpected trail
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          } else if (i + 1 === length) {
            // unpaired lead
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          }

          // valid lead
          leadSurrogate = codePoint;

          continue
        }

        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          leadSurrogate = codePoint;
          continue
        }

        // valid surrogate pair
        codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
      } else if (leadSurrogate) {
        // valid bmp char, but last char was a lead
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
      }

      leadSurrogate = null;

      // encode utf8
      if (codePoint < 0x80) {
        if ((units -= 1) < 0) break
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        if ((units -= 2) < 0) break
        bytes.push(
          codePoint >> 0x6 | 0xC0,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x10000) {
        if ((units -= 3) < 0) break
        bytes.push(
          codePoint >> 0xC | 0xE0,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x110000) {
        if ((units -= 4) < 0) break
        bytes.push(
          codePoint >> 0x12 | 0xF0,
          codePoint >> 0xC & 0x3F | 0x80,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else {
        throw new Error('Invalid code point')
      }
    }

    return bytes
  }

  function asciiToBytes (str) {
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      // Node's code seems to be doing this and not & 0x7F..
      byteArray.push(str.charCodeAt(i) & 0xFF);
    }
    return byteArray
  }

  function utf16leToBytes (str, units) {
    var c, hi, lo;
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      if ((units -= 2) < 0) break

      c = str.charCodeAt(i);
      hi = c >> 8;
      lo = c % 256;
      byteArray.push(lo);
      byteArray.push(hi);
    }

    return byteArray
  }


  function base64ToBytes (str) {
    return toByteArray(base64clean(str))
  }

  function blitBuffer (src, dst, offset, length) {
    for (var i = 0; i < length; ++i) {
      if ((i + offset >= dst.length) || (i >= src.length)) break
      dst[i + offset] = src[i];
    }
    return i
  }

  function isnan (val) {
    return val !== val // eslint-disable-line no-self-compare
  }


  // the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
  // The _isBuffer check is for Safari 5-7 support, because it's missing
  // Object.prototype.constructor. Remove this eventually
  function isBuffer(obj) {
    return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
  }

  function isFastBuffer (obj) {
    return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
  }

  // For Node v0.10 support. Remove this eventually.
  function isSlowBuffer (obj) {
    return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
  }

  /*
    @license
  	Rollup.js v2.77.0
  	Fri, 15 Jul 2022 10:23:18 GMT - commit 87da8ef24f61d6601dc550026fc59f8066bbb95d

  	https://github.com/rollup/rollup

  	Released under the MIT License.
  */
  for(var e="2.77.0",t={},i="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",s=0;s<i.length;s++)t[i.charCodeAt(s)]=s;function n(e,t,i){4===i?e.push([t[0],t[1],t[2],t[3]]):5===i?e.push([t[0],t[1],t[2],t[3],t[4]]):1===i&&e.push([t[0]]);}function r(e){var t="";e=e<0?-e<<1|1:e<<1;do{var s=31&e;(e>>>=5)>0&&(s|=32),t+=i[s];}while(e>0);return t}class a{constructor(e){this.bits=e instanceof a?e.bits.slice():[];}add(e){this.bits[e>>5]|=1<<(31&e);}has(e){return !!(this.bits[e>>5]&1<<(31&e))}}class o{constructor(e,t,i){this.start=e,this.end=t,this.original=i,this.intro="",this.outro="",this.content=i,this.storeName=!1,this.edited=!1,Object.defineProperties(this,{previous:{writable:!0,value:null},next:{writable:!0,value:null}});}appendLeft(e){this.outro+=e;}appendRight(e){this.intro=this.intro+e;}clone(){const e=new o(this.start,this.end,this.original);return e.intro=this.intro,e.outro=this.outro,e.content=this.content,e.storeName=this.storeName,e.edited=this.edited,e}contains(e){return this.start<e&&e<this.end}eachNext(e){let t=this;for(;t;)e(t),t=t.next;}eachPrevious(e){let t=this;for(;t;)e(t),t=t.previous;}edit(e,t,i){return this.content=e,i||(this.intro="",this.outro=""),this.storeName=t,this.edited=!0,this}prependLeft(e){this.outro=e+this.outro;}prependRight(e){this.intro=e+this.intro;}split(e){const t=e-this.start,i=this.original.slice(0,t),s=this.original.slice(t);this.original=i;const n=new o(e,this.end,s);return n.outro=this.outro,this.outro="",this.end=e,this.edited?(n.edit("",!1),this.content=""):this.content=i,n.next=this.next,n.next&&(n.next.previous=n),n.previous=this,this.next=n,n}toString(){return this.intro+this.content+this.outro}trimEnd(e){if(this.outro=this.outro.replace(e,""),this.outro.length)return !0;const t=this.content.replace(e,"");return t.length?(t!==this.content&&this.split(this.start+t.length).edit("",void 0,!0),!0):(this.edit("",void 0,!0),this.intro=this.intro.replace(e,""),!!this.intro.length||void 0)}trimStart(e){if(this.intro=this.intro.replace(e,""),this.intro.length)return !0;const t=this.content.replace(e,"");return t.length?(t!==this.content&&(this.split(this.end-t.length),this.edit("",void 0,!0)),!0):(this.edit("",void 0,!0),this.outro=this.outro.replace(e,""),!!this.outro.length||void 0)}}let l=()=>{throw new Error("Unsupported environment: `window.btoa` or `Buffer` should be supported.")};"undefined"!=typeof window&&"function"==typeof window.btoa?l=e=>window.btoa(unescape(encodeURIComponent(e))):"function"==typeof Buffer&&(l=e=>Buffer.from(e,"utf-8").toString("base64"));class h{constructor(e){this.version=3,this.file=e.file,this.sources=e.sources,this.sourcesContent=e.sourcesContent,this.names=e.names,this.mappings=function(e){for(var t=0,i=0,s=0,n=0,a="",o=0;o<e.length;o++){var l=e[o];if(o>0&&(a+=";"),0!==l.length){for(var h=0,c=[],u=0,d=l;u<d.length;u++){var p=d[u],f=r(p[0]-h);h=p[0],p.length>1&&(f+=r(p[1]-t)+r(p[2]-i)+r(p[3]-s),t=p[1],i=p[2],s=p[3]),5===p.length&&(f+=r(p[4]-n),n=p[4]),c.push(f);}a+=c.join(",");}}return a}(e.mappings);}toString(){return JSON.stringify(this)}toUrl(){return "data:application/json;charset=utf-8;base64,"+l(this.toString())}}function c(e){const t=e.split("\n"),i=t.filter((e=>/^\t+/.test(e))),s=t.filter((e=>/^ {2,}/.test(e)));if(0===i.length&&0===s.length)return null;if(i.length>=s.length)return "\t";const n=s.reduce(((e,t)=>{const i=/^ +/.exec(t)[0].length;return Math.min(i,e)}),1/0);return new Array(n+1).join(" ")}function u(e,t){const i=e.split(/[/\\]/),s=t.split(/[/\\]/);for(i.pop();i[0]===s[0];)i.shift(),s.shift();if(i.length){let e=i.length;for(;e--;)i[e]="..";}return i.concat(s).join("/")}const d=Object.prototype.toString;function p(e){return "[object Object]"===d.call(e)}function f(e){const t=e.split("\n"),i=[];for(let e=0,s=0;e<t.length;e++)i.push(s),s+=t[e].length+1;return function(e){let t=0,s=i.length;for(;t<s;){const n=t+s>>1;e<i[n]?s=n:t=n+1;}const n=t-1;return {line:n,column:e-i[n]}}}class m{constructor(e){this.hires=e,this.generatedCodeLine=0,this.generatedCodeColumn=0,this.raw=[],this.rawSegments=this.raw[this.generatedCodeLine]=[],this.pending=null;}addEdit(e,t,i,s){if(t.length){const t=[this.generatedCodeColumn,e,i.line,i.column];s>=0&&t.push(s),this.rawSegments.push(t);}else this.pending&&this.rawSegments.push(this.pending);this.advance(t),this.pending=null;}addUneditedChunk(e,t,i,s,n){let r=t.start,a=!0;for(;r<t.end;)(this.hires||a||n.has(r))&&this.rawSegments.push([this.generatedCodeColumn,e,s.line,s.column]),"\n"===i[r]?(s.line+=1,s.column=0,this.generatedCodeLine+=1,this.raw[this.generatedCodeLine]=this.rawSegments=[],this.generatedCodeColumn=0,a=!0):(s.column+=1,this.generatedCodeColumn+=1,a=!1),r+=1;this.pending=null;}advance(e){if(!e)return;const t=e.split("\n");if(t.length>1){for(let e=0;e<t.length-1;e++)this.generatedCodeLine++,this.raw[this.generatedCodeLine]=this.rawSegments=[];this.generatedCodeColumn=0;}this.generatedCodeColumn+=t[t.length-1].length;}}const g="\n",y={insertLeft:!1,insertRight:!1,storeName:!1};class x{constructor(e,t={}){const i=new o(0,e.length,e);Object.defineProperties(this,{original:{writable:!0,value:e},outro:{writable:!0,value:""},intro:{writable:!0,value:""},firstChunk:{writable:!0,value:i},lastChunk:{writable:!0,value:i},lastSearchedChunk:{writable:!0,value:i},byStart:{writable:!0,value:{}},byEnd:{writable:!0,value:{}},filename:{writable:!0,value:t.filename},indentExclusionRanges:{writable:!0,value:t.indentExclusionRanges},sourcemapLocations:{writable:!0,value:new a},storedNames:{writable:!0,value:{}},indentStr:{writable:!0,value:c(e)}}),this.byStart[0]=i,this.byEnd[e.length]=i;}addSourcemapLocation(e){this.sourcemapLocations.add(e);}append(e){if("string"!=typeof e)throw new TypeError("outro content must be a string");return this.outro+=e,this}appendLeft(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);const i=this.byEnd[e];return i?i.appendLeft(t):this.intro+=t,this}appendRight(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);const i=this.byStart[e];return i?i.appendRight(t):this.outro+=t,this}clone(){const e=new x(this.original,{filename:this.filename});let t=this.firstChunk,i=e.firstChunk=e.lastSearchedChunk=t.clone();for(;t;){e.byStart[i.start]=i,e.byEnd[i.end]=i;const s=t.next,n=s&&s.clone();n&&(i.next=n,n.previous=i,i=n),t=s;}return e.lastChunk=i,this.indentExclusionRanges&&(e.indentExclusionRanges=this.indentExclusionRanges.slice()),e.sourcemapLocations=new a(this.sourcemapLocations),e.intro=this.intro,e.outro=this.outro,e}generateDecodedMap(e){e=e||{};const t=Object.keys(this.storedNames),i=new m(e.hires),s=f(this.original);return this.intro&&i.advance(this.intro),this.firstChunk.eachNext((e=>{const n=s(e.start);e.intro.length&&i.advance(e.intro),e.edited?i.addEdit(0,e.content,n,e.storeName?t.indexOf(e.original):-1):i.addUneditedChunk(0,e,this.original,n,this.sourcemapLocations),e.outro.length&&i.advance(e.outro);})),{file:e.file?e.file.split(/[/\\]/).pop():null,sources:[e.source?u(e.file||"",e.source):null],sourcesContent:e.includeContent?[this.original]:[null],names:t,mappings:i.raw}}generateMap(e){return new h(this.generateDecodedMap(e))}getIndentString(){return null===this.indentStr?"\t":this.indentStr}indent(e,t){const i=/^[^\r\n]/gm;if(p(e)&&(t=e,e=void 0),""===(e=void 0!==e?e:this.indentStr||"\t"))return this;const s={};if((t=t||{}).exclude){("number"==typeof t.exclude[0]?[t.exclude]:t.exclude).forEach((e=>{for(let t=e[0];t<e[1];t+=1)s[t]=!0;}));}let n=!1!==t.indentStart;const r=t=>n?`${e}${t}`:(n=!0,t);this.intro=this.intro.replace(i,r);let a=0,o=this.firstChunk;for(;o;){const t=o.end;if(o.edited)s[a]||(o.content=o.content.replace(i,r),o.content.length&&(n="\n"===o.content[o.content.length-1]));else for(a=o.start;a<t;){if(!s[a]){const t=this.original[a];"\n"===t?n=!0:"\r"!==t&&n&&(n=!1,a===o.start||(this._splitChunk(o,a),o=o.next),o.prependRight(e));}a+=1;}a=o.end,o=o.next;}return this.outro=this.outro.replace(i,r),this}insert(){throw new Error("magicString.insert(...) is deprecated. Use prependRight(...) or appendLeft(...)")}insertLeft(e,t){return y.insertLeft||(console.warn("magicString.insertLeft(...) is deprecated. Use magicString.appendLeft(...) instead"),y.insertLeft=!0),this.appendLeft(e,t)}insertRight(e,t){return y.insertRight||(console.warn("magicString.insertRight(...) is deprecated. Use magicString.prependRight(...) instead"),y.insertRight=!0),this.prependRight(e,t)}move(e,t,i){if(i>=e&&i<=t)throw new Error("Cannot move a selection inside itself");this._split(e),this._split(t),this._split(i);const s=this.byStart[e],n=this.byEnd[t],r=s.previous,a=n.next,o=this.byStart[i];if(!o&&n===this.lastChunk)return this;const l=o?o.previous:this.lastChunk;return r&&(r.next=a),a&&(a.previous=r),l&&(l.next=s),o&&(o.previous=n),s.previous||(this.firstChunk=n.next),n.next||(this.lastChunk=s.previous,this.lastChunk.next=null),s.previous=l,n.next=o||null,l||(this.firstChunk=s),o||(this.lastChunk=n),this}overwrite(e,t,i,s){if("string"!=typeof i)throw new TypeError("replacement content must be a string");for(;e<0;)e+=this.original.length;for(;t<0;)t+=this.original.length;if(t>this.original.length)throw new Error("end is out of bounds");if(e===t)throw new Error("Cannot overwrite a zero-length range – use appendLeft or prependRight instead");this._split(e),this._split(t),!0===s&&(y.storeName||(console.warn("The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string"),y.storeName=!0),s={storeName:!0});const n=void 0!==s&&s.storeName,r=void 0!==s&&s.contentOnly;if(n){const i=this.original.slice(e,t);Object.defineProperty(this.storedNames,i,{writable:!0,value:!0,enumerable:!0});}const a=this.byStart[e],l=this.byEnd[t];if(a){let e=a;for(;e!==l;){if(e.next!==this.byStart[e.end])throw new Error("Cannot overwrite across a split point");e=e.next,e.edit("",!1);}a.edit(i,n,r);}else {const s=new o(e,t,"").edit(i,n);l.next=s,s.previous=l;}return this}prepend(e){if("string"!=typeof e)throw new TypeError("outro content must be a string");return this.intro=e+this.intro,this}prependLeft(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);const i=this.byEnd[e];return i?i.prependLeft(t):this.intro=t+this.intro,this}prependRight(e,t){if("string"!=typeof t)throw new TypeError("inserted content must be a string");this._split(e);const i=this.byStart[e];return i?i.prependRight(t):this.outro=t+this.outro,this}remove(e,t){for(;e<0;)e+=this.original.length;for(;t<0;)t+=this.original.length;if(e===t)return this;if(e<0||t>this.original.length)throw new Error("Character is out of bounds");if(e>t)throw new Error("end must be greater than start");this._split(e),this._split(t);let i=this.byStart[e];for(;i;)i.intro="",i.outro="",i.edit(""),i=t>i.end?this.byStart[i.end]:null;return this}lastChar(){if(this.outro.length)return this.outro[this.outro.length-1];let e=this.lastChunk;do{if(e.outro.length)return e.outro[e.outro.length-1];if(e.content.length)return e.content[e.content.length-1];if(e.intro.length)return e.intro[e.intro.length-1]}while(e=e.previous);return this.intro.length?this.intro[this.intro.length-1]:""}lastLine(){let e=this.outro.lastIndexOf(g);if(-1!==e)return this.outro.substr(e+1);let t=this.outro,i=this.lastChunk;do{if(i.outro.length>0){if(e=i.outro.lastIndexOf(g),-1!==e)return i.outro.substr(e+1)+t;t=i.outro+t;}if(i.content.length>0){if(e=i.content.lastIndexOf(g),-1!==e)return i.content.substr(e+1)+t;t=i.content+t;}if(i.intro.length>0){if(e=i.intro.lastIndexOf(g),-1!==e)return i.intro.substr(e+1)+t;t=i.intro+t;}}while(i=i.previous);return e=this.intro.lastIndexOf(g),-1!==e?this.intro.substr(e+1)+t:this.intro+t}slice(e=0,t=this.original.length){for(;e<0;)e+=this.original.length;for(;t<0;)t+=this.original.length;let i="",s=this.firstChunk;for(;s&&(s.start>e||s.end<=e);){if(s.start<t&&s.end>=t)return i;s=s.next;}if(s&&s.edited&&s.start!==e)throw new Error(`Cannot use replaced character ${e} as slice start anchor.`);const n=s;for(;s;){!s.intro||n===s&&s.start!==e||(i+=s.intro);const r=s.start<t&&s.end>=t;if(r&&s.edited&&s.end!==t)throw new Error(`Cannot use replaced character ${t} as slice end anchor.`);const a=n===s?e-s.start:0,o=r?s.content.length+t-s.end:s.content.length;if(i+=s.content.slice(a,o),!s.outro||r&&s.end!==t||(i+=s.outro),r)break;s=s.next;}return i}snip(e,t){const i=this.clone();return i.remove(0,e),i.remove(t,i.original.length),i}_split(e){if(this.byStart[e]||this.byEnd[e])return;let t=this.lastSearchedChunk;const i=e>t.end;for(;t;){if(t.contains(e))return this._splitChunk(t,e);t=i?this.byStart[t.end]:this.byEnd[t.start];}}_splitChunk(e,t){if(e.edited&&e.content.length){const i=f(this.original)(t);throw new Error(`Cannot split a chunk that has already been edited (${i.line}:${i.column} – "${e.original}")`)}const i=e.split(t);return this.byEnd[t]=e,this.byStart[t]=i,this.byEnd[i.end]=i,e===this.lastChunk&&(this.lastChunk=i),this.lastSearchedChunk=e,!0}toString(){let e=this.intro,t=this.firstChunk;for(;t;)e+=t.toString(),t=t.next;return e+this.outro}isEmpty(){let e=this.firstChunk;do{if(e.intro.length&&e.intro.trim()||e.content.length&&e.content.trim()||e.outro.length&&e.outro.trim())return !1}while(e=e.next);return !0}length(){let e=this.firstChunk,t=0;do{t+=e.intro.length+e.content.length+e.outro.length;}while(e=e.next);return t}trimLines(){return this.trim("[\\r\\n]")}trim(e){return this.trimStart(e).trimEnd(e)}trimEndAborted(e){const t=new RegExp((e||"\\s")+"+$");if(this.outro=this.outro.replace(t,""),this.outro.length)return !0;let i=this.lastChunk;do{const e=i.end,s=i.trimEnd(t);if(i.end!==e&&(this.lastChunk===i&&(this.lastChunk=i.next),this.byEnd[i.end]=i,this.byStart[i.next.start]=i.next,this.byEnd[i.next.end]=i.next),s)return !0;i=i.previous;}while(i);return !1}trimEnd(e){return this.trimEndAborted(e),this}trimStartAborted(e){const t=new RegExp("^"+(e||"\\s")+"+");if(this.intro=this.intro.replace(t,""),this.intro.length)return !0;let i=this.firstChunk;do{const e=i.end,s=i.trimStart(t);if(i.end!==e&&(i===this.lastChunk&&(this.lastChunk=i.next),this.byEnd[i.end]=i,this.byStart[i.next.start]=i.next,this.byEnd[i.next.end]=i.next),s)return !0;i=i.next;}while(i);return !1}trimStart(e){return this.trimStartAborted(e),this}hasChanged(){return this.original!==this.toString()}replace(e,t){function i(e,i){return "string"==typeof t?t.replace(/\$(\$|&|\d+)/g,((t,i)=>{if("$"===i)return "$";if("&"===i)return e[0];return +i<e.length?e[+i]:`$${i}`})):t(...e,e.index,i,e.groups)}if("string"!=typeof e&&e.global){(function(e,t){let i;const s=[];for(;i=e.exec(t);)s.push(i);return s})(e,this.original).forEach((e=>{null!=e.index&&this.overwrite(e.index,e.index+e[0].length,i(e,this.original));}));}else {const t=this.original.match(e);t&&null!=t.index&&this.overwrite(t.index,t.index+t[0].length,i(t,this.original));}return this}}const E=Object.prototype.hasOwnProperty;class b{constructor(e={}){this.intro=e.intro||"",this.separator=void 0!==e.separator?e.separator:"\n",this.sources=[],this.uniqueSources=[],this.uniqueSourceIndexByFilename={};}addSource(e){if(e instanceof x)return this.addSource({content:e,filename:e.filename,separator:this.separator});if(!p(e)||!e.content)throw new Error("bundle.addSource() takes an object with a `content` property, which should be an instance of MagicString, and an optional `filename`");if(["filename","indentExclusionRanges","separator"].forEach((t=>{E.call(e,t)||(e[t]=e.content[t]);})),void 0===e.separator&&(e.separator=this.separator),e.filename)if(E.call(this.uniqueSourceIndexByFilename,e.filename)){const t=this.uniqueSources[this.uniqueSourceIndexByFilename[e.filename]];if(e.content.original!==t.content)throw new Error(`Illegal source: same filename (${e.filename}), different contents`)}else this.uniqueSourceIndexByFilename[e.filename]=this.uniqueSources.length,this.uniqueSources.push({filename:e.filename,content:e.content.original});return this.sources.push(e),this}append(e,t){return this.addSource({content:new x(e),separator:t&&t.separator||""}),this}clone(){const e=new b({intro:this.intro,separator:this.separator});return this.sources.forEach((t=>{e.addSource({filename:t.filename,content:t.content.clone(),separator:t.separator});})),e}generateDecodedMap(e={}){const t=[];this.sources.forEach((e=>{Object.keys(e.content.storedNames).forEach((e=>{~t.indexOf(e)||t.push(e);}));}));const i=new m(e.hires);return this.intro&&i.advance(this.intro),this.sources.forEach(((e,s)=>{s>0&&i.advance(this.separator);const n=e.filename?this.uniqueSourceIndexByFilename[e.filename]:-1,r=e.content,a=f(r.original);r.intro&&i.advance(r.intro),r.firstChunk.eachNext((s=>{const o=a(s.start);s.intro.length&&i.advance(s.intro),e.filename?s.edited?i.addEdit(n,s.content,o,s.storeName?t.indexOf(s.original):-1):i.addUneditedChunk(n,s,r.original,o,r.sourcemapLocations):i.advance(s.content),s.outro.length&&i.advance(s.outro);})),r.outro&&i.advance(r.outro);})),{file:e.file?e.file.split(/[/\\]/).pop():null,sources:this.uniqueSources.map((t=>e.file?u(e.file,t.filename):t.filename)),sourcesContent:this.uniqueSources.map((t=>e.includeContent?t.content:null)),names:t,mappings:i.raw}}generateMap(e){return new h(this.generateDecodedMap(e))}getIndentString(){const e={};return this.sources.forEach((t=>{const i=t.content.indentStr;null!==i&&(e[i]||(e[i]=0),e[i]+=1);})),Object.keys(e).sort(((t,i)=>e[t]-e[i]))[0]||"\t"}indent(e){if(arguments.length||(e=this.getIndentString()),""===e)return this;let t=!this.intro||"\n"===this.intro.slice(-1);return this.sources.forEach(((i,s)=>{const n=void 0!==i.separator?i.separator:this.separator,r=t||s>0&&/\r?\n$/.test(n);i.content.indent(e,{exclude:i.indentExclusionRanges,indentStart:r}),t="\n"===i.content.lastChar();})),this.intro&&(this.intro=e+this.intro.replace(/^[^\n]/gm,((t,i)=>i>0?e+t:t))),this}prepend(e){return this.intro=e+this.intro,this}toString(){const e=this.sources.map(((e,t)=>{const i=void 0!==e.separator?e.separator:this.separator;return (t>0?i:"")+e.content.toString()})).join("");return this.intro+e}isEmpty(){return (!this.intro.length||!this.intro.trim())&&!this.sources.some((e=>!e.content.isEmpty()))}length(){return this.sources.reduce(((e,t)=>e+t.content.length()),this.intro.length)}trimLines(){return this.trim("[\\r\\n]")}trim(e){return this.trimStart(e).trimEnd(e)}trimStart(e){const t=new RegExp("^"+(e||"\\s")+"+");if(this.intro=this.intro.replace(t,""),!this.intro){let t,i=0;do{if(t=this.sources[i++],!t)break}while(!t.content.trimStartAborted(e))}return this}trimEnd(e){const t=new RegExp((e||"\\s")+"+$");let i,s=this.sources.length-1;do{if(i=this.sources[s--],!i){this.intro=this.intro.replace(t,"");break}}while(!i.content.trimEndAborted(e));return this}}const v=/^(?:\/|(?:[A-Za-z]:)?[\\|/])/,S=/^\.?\.\//,A=/\\/g,I=/[/\\]/,k=/\.[^.]+$/;function P(e){return v.test(e)}function w(e){return S.test(e)}function C(e){return e.replace(A,"/")}function _(e){return e.split(I).pop()||""}function N(e){const t=/[/\\][^/\\]*$/.exec(e);if(!t)return ".";const i=e.slice(0,-t[0].length);return i||"/"}function $(e){const t=k.exec(_(e));return t?t[0]:""}function T(e,t){const i=e.split(I).filter(Boolean),s=t.split(I).filter(Boolean);for("."===i[0]&&i.shift(),"."===s[0]&&s.shift();i[0]&&s[0]&&i[0]===s[0];)i.shift(),s.shift();for(;".."===s[0]&&i.length>0;)s.shift(),i.pop();for(;i.pop();)s.unshift("..");return s.join("/")}function O(...e){const t=e.shift();if(!t)return "/";let i=t.split(I);for(const t of e)if(P(t))i=t.split(I);else {const e=t.split(I);for(;"."===e[0]||".."===e[0];){".."===e.shift()&&i.pop();}i.push(...e);}return i.join("/")}function R(e,t,i){const s=e.get(t);if(s)return s;const n=i();return e.set(t,n),n}const M=Symbol("Unknown Key"),D=Symbol("Unknown Non-Accessor Key"),L=Symbol("Unknown Integer"),V=[],B=[M],F=[D],z=[L],j=Symbol("Entities");class U{constructor(){this.entityPaths=Object.create(null,{[j]:{value:new Set}});}trackEntityAtPathAndGetIfTracked(e,t){const i=this.getEntities(e);return !!i.has(t)||(i.add(t),!1)}withTrackedEntityAtPath(e,t,i,s){const n=this.getEntities(e);if(n.has(t))return s;n.add(t);const r=i();return n.delete(t),r}getEntities(e){let t=this.entityPaths;for(const i of e)t=t[i]=t[i]||Object.create(null,{[j]:{value:new Set}});return t[j]}}const G=new U;class H{constructor(){this.entityPaths=Object.create(null,{[j]:{value:new Map}});}trackEntityAtPathAndGetIfTracked(e,t,i){let s=this.entityPaths;for(const t of e)s=s[t]=s[t]||Object.create(null,{[j]:{value:new Map}});const n=R(s[j],t,(()=>new Set));return !!n.has(i)||(n.add(i),!1)}}const W=Symbol("Unknown Value"),q=Symbol("Unknown Truthy Value");class K{constructor(){this.included=!1;}deoptimizePath(e){}deoptimizeThisOnInteractionAtPath({thisArg:e},t,i){e.deoptimizePath(B);}getLiteralValueAtPath(e,t,i){return W}getReturnExpressionWhenCalledAtPath(e,t,i,s){return X}hasEffectsOnInteractionAtPath(e,t,i){return !0}include(e,t,i){this.included=!0;}includeCallArguments(e,t){for(const i of t)i.include(e,!1);}shouldBeIncluded(e){return !0}}const X=new class extends K{},Y={thisArg:null,type:0},Q={args:[X],thisArg:null,type:1},Z=[],J={args:Z,thisArg:null,type:2,withNew:!1};class ee extends K{constructor(e){super(),this.name=e,this.alwaysRendered=!1,this.initReached=!1,this.isId=!1,this.isReassigned=!1,this.kind=null,this.renderBaseName=null,this.renderName=null;}addReference(e){}getBaseVariableName(){return this.renderBaseName||this.renderName||this.name}getName(e){const t=this.renderName||this.name;return this.renderBaseName?`${this.renderBaseName}${e(t)}`:t}hasEffectsOnInteractionAtPath(e,{type:t},i){return 0!==t||e.length>0}include(){this.included=!0;}markCalledFromTryStatement(){}setRenderNames(e,t){this.renderBaseName=e,this.renderName=t;}}class te extends ee{constructor(e,t){super(t),this.referenced=!1,this.module=e,this.isNamespace="*"===t;}addReference(e){this.referenced=!0,"default"!==this.name&&"*"!==this.name||this.module.suggestName(e.name);}hasEffectsOnInteractionAtPath(e,{type:t}){return 0!==t||e.length>(this.isNamespace?1:0)}include(){this.included||(this.included=!0,this.module.used=!0);}}const ie=Object.freeze(Object.create(null)),se=Object.freeze({}),ne=Object.freeze([]);function re(e,t,i){if("number"==typeof i)throw new Error("locate takes a { startIndex, offsetLine, offsetColumn } object as the third argument");return function(e,t){void 0===t&&(t={});var i=t.offsetLine||0,s=t.offsetColumn||0,n=e.split("\n"),r=0,a=n.map((function(e,t){var i=r+e.length+1,s={start:r,end:i,line:t};return r=i,s})),o=0;function l(e,t){return e.start<=t&&t<e.end}function h(e,t){return {line:i+e.line,column:s+t-e.start,character:t}}return function(t,i){"string"==typeof t&&(t=e.indexOf(t,i||0));for(var s=a[o],n=t>=s.end?1:-1;s;){if(l(s,t))return h(s,t);s=a[o+=n];}}}(e,i)(t,i&&i.startIndex)}function ae(e){return e.replace(/^\t+/,(e=>e.split("\t").join("  ")))}function oe(e,t){const i=e.length<=1,s=e.map((e=>`"${e}"`));let n=i?s[0]:`${s.slice(0,-1).join(", ")} and ${s.slice(-1)[0]}`;return t&&(n+=` ${i?t[0]:t[1]}`),n}function le(e){const t=_(e);return t.substring(0,t.length-$(e).length)}function he(e){return P(e)?T(O(),e):e}function ce(e){return "/"===e[0]||"."===e[0]&&("/"===e[1]||"."===e[1])||P(e)}const ue=/^(\.\.\/)*\.\.$/;function de(e,t,i,s){let n=C(T(N(e),t));if(i&&n.endsWith(".js")&&(n=n.slice(0,-3)),s){if(""===n)return "../"+_(t);if(ue.test(n))return n.split("/").concat(["..",_(t)]).join("/")}return n?n.startsWith("..")?n:"./"+n:"."}function pe(e){throw e instanceof Error||(e=Object.assign(new Error(e.message),e)),e}function fe(e,t,i,s){if("object"==typeof t){const{line:i,column:n}=t;e.loc={column:n,file:s,line:i};}else {e.pos=t;const{line:n,column:r}=re(i,t,{offsetLine:1});e.loc={column:r,file:s,line:n};}if(void 0===e.frame){const{line:t,column:s}=e.loc;e.frame=function(e,t,i){let s=e.split("\n");const n=Math.max(0,t-3);let r=Math.min(t+2,s.length);for(s=s.slice(n,r);!/\S/.test(s[s.length-1]);)s.pop(),r-=1;const a=String(r).length;return s.map(((e,s)=>{const r=n+s+1===t;let o=String(s+n+1);for(;o.length<a;)o=` ${o}`;if(r){const t=function(e){let t="";for(;e--;)t+=" ";return t}(a+2+ae(e.slice(0,i)).length)+"^";return `${o}: ${ae(e)}\n${t}`}return `${o}: ${ae(e)}`})).join("\n")}(i,t,s);}}var me;function ge({fileName:e,code:t},i){const s={code:me.CHUNK_INVALID,message:`Chunk "${e}" is not valid JavaScript: ${i.message}.`};return fe(s,i.loc,t,e),s}function ye(e,t,i){return {code:"INVALID_EXPORT_OPTION",message:`"${e}" was specified for "output.exports", but entry module "${he(i)}" has the following exports: ${t.join(", ")}`}}function xe(e,t,i,s){return {code:me.INVALID_OPTION,message:`Invalid value ${void 0!==s?`${JSON.stringify(s)} `:""}for option "${e}" - ${i}.`,url:`https://rollupjs.org/guide/en/#${t}`}}function Ee(e,t,i){return {code:me.MISSING_EXPORT,message:`'${e}' is not exported by ${he(i)}, imported by ${he(t)}`,url:"https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module"}}function be(e){const t=Array.from(e.implicitlyLoadedBefore,(e=>he(e.id))).sort();return {code:me.MISSING_IMPLICIT_DEPENDANT,message:`Module "${he(e.id)}" that should be implicitly loaded before ${oe(t)} is not included in the module graph. Either it was not imported by an included module or only via a tree-shaken dynamic import, or no imported bindings were used and it had otherwise no side-effects.`}}function ve(e,t,i){const s=i?"reexport":"import";return {code:me.UNEXPECTED_NAMED_IMPORT,id:e,message:`The named export "${t}" was ${s}ed from the external module ${he(e)} even though its interop type is "defaultOnly". Either remove or change this ${s} or change the value of the "output.interop" option.`,url:"https://rollupjs.org/guide/en/#outputinterop"}}function Se(e){return {code:me.UNEXPECTED_NAMED_IMPORT,id:e,message:`There was a namespace "*" reexport from the external module ${he(e)} even though its interop type is "defaultOnly". This will be ignored as namespace reexports only reexport named exports. If this is not intended, either remove or change this reexport or change the value of the "output.interop" option.`,url:"https://rollupjs.org/guide/en/#outputinterop"}}function Ae(e){return {code:me.VALIDATION_ERROR,message:e}}function Ie(){return {code:me.ALREADY_CLOSED,message:'Bundle is already closed, no more calls to "generate" or "write" are allowed.'}}function ke(e,t,i){Pe(e,t,i.onwarn,i.strictDeprecations);}function Pe(e,t,i,s){if(t||s){const t=function(e){return {code:me.DEPRECATED_FEATURE,..."string"==typeof e?{message:e}:e}}(e);if(s)return pe(t);i(t);}}!function(e){e.ALREADY_CLOSED="ALREADY_CLOSED",e.ASSET_NOT_FINALISED="ASSET_NOT_FINALISED",e.ASSET_NOT_FOUND="ASSET_NOT_FOUND",e.ASSET_SOURCE_ALREADY_SET="ASSET_SOURCE_ALREADY_SET",e.ASSET_SOURCE_MISSING="ASSET_SOURCE_MISSING",e.BAD_LOADER="BAD_LOADER",e.CANNOT_EMIT_FROM_OPTIONS_HOOK="CANNOT_EMIT_FROM_OPTIONS_HOOK",e.CHUNK_NOT_GENERATED="CHUNK_NOT_GENERATED",e.CHUNK_INVALID="CHUNK_INVALID",e.CIRCULAR_REEXPORT="CIRCULAR_REEXPORT",e.CYCLIC_CROSS_CHUNK_REEXPORT="CYCLIC_CROSS_CHUNK_REEXPORT",e.DEPRECATED_FEATURE="DEPRECATED_FEATURE",e.EXTERNAL_SYNTHETIC_EXPORTS="EXTERNAL_SYNTHETIC_EXPORTS",e.FILE_NAME_CONFLICT="FILE_NAME_CONFLICT",e.FILE_NOT_FOUND="FILE_NOT_FOUND",e.INPUT_HOOK_IN_OUTPUT_PLUGIN="INPUT_HOOK_IN_OUTPUT_PLUGIN",e.INVALID_CHUNK="INVALID_CHUNK",e.INVALID_EXPORT_OPTION="INVALID_EXPORT_OPTION",e.INVALID_EXTERNAL_ID="INVALID_EXTERNAL_ID",e.INVALID_OPTION="INVALID_OPTION",e.INVALID_PLUGIN_HOOK="INVALID_PLUGIN_HOOK",e.INVALID_ROLLUP_PHASE="INVALID_ROLLUP_PHASE",e.MISSING_EXPORT="MISSING_EXPORT",e.MISSING_IMPLICIT_DEPENDANT="MISSING_IMPLICIT_DEPENDANT",e.MIXED_EXPORTS="MIXED_EXPORTS",e.NAMESPACE_CONFLICT="NAMESPACE_CONFLICT",e.AMBIGUOUS_EXTERNAL_NAMESPACES="AMBIGUOUS_EXTERNAL_NAMESPACES",e.NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE="NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE",e.PLUGIN_ERROR="PLUGIN_ERROR",e.PREFER_NAMED_EXPORTS="PREFER_NAMED_EXPORTS",e.SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT="SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT",e.UNEXPECTED_NAMED_IMPORT="UNEXPECTED_NAMED_IMPORT",e.UNRESOLVED_ENTRY="UNRESOLVED_ENTRY",e.UNRESOLVED_IMPORT="UNRESOLVED_IMPORT",e.VALIDATION_ERROR="VALIDATION_ERROR";}(me||(me={}));var we=new Set(["await","break","case","catch","class","const","continue","debugger","default","delete","do","else","enum","eval","export","extends","false","finally","for","function","if","implements","import","in","instanceof","interface","let","NaN","new","null","package","private","protected","public","return","static","super","switch","this","throw","true","try","typeof","undefined","var","void","while","with","yield"]);const Ce=/[^$_a-zA-Z0-9]/g,_e=e=>/\d/.test(e[0]);function Ne(e){return e=e.replace(/-(\w)/g,((e,t)=>t.toUpperCase())).replace(Ce,"_"),(_e(e)||we.has(e))&&(e=`_${e}`),e||"_"}class $e{constructor(e,t,i,s,n){this.options=e,this.id=t,this.renormalizeRenderPath=n,this.declarations=new Map,this.defaultVariableName="",this.dynamicImporters=[],this.execIndex=1/0,this.exportedVariables=new Map,this.importers=[],this.mostCommonSuggestion=0,this.nameSuggestions=new Map,this.namespaceVariableName="",this.reexported=!1,this.renderPath=void 0,this.used=!1,this.variableName="",this.suggestedVariableName=Ne(t.split(/[\\/]/).pop());const{importers:r,dynamicImporters:a}=this,o=this.info={ast:null,code:null,dynamicallyImportedIdResolutions:ne,dynamicallyImportedIds:ne,get dynamicImporters(){return a.sort()},hasDefaultExport:null,get hasModuleSideEffects(){return ke("Accessing ModuleInfo.hasModuleSideEffects from plugins is deprecated. Please use ModuleInfo.moduleSideEffects instead.",!1,e),o.moduleSideEffects},id:t,implicitlyLoadedAfterOneOf:ne,implicitlyLoadedBefore:ne,importedIdResolutions:ne,importedIds:ne,get importers(){return r.sort()},isEntry:!1,isExternal:!0,isIncluded:null,meta:s,moduleSideEffects:i,syntheticNamedExports:!1};Object.defineProperty(this.info,"hasModuleSideEffects",{enumerable:!1});}getVariableForExportName(e){const t=this.declarations.get(e);if(t)return [t];const i=new te(this,e);return this.declarations.set(e,i),this.exportedVariables.set(i,e),[i]}setRenderPath(e,t){this.renderPath="function"==typeof e.paths?e.paths(this.id):e.paths[this.id],this.renderPath||(this.renderPath=this.renormalizeRenderPath?C(T(t,this.id)):this.id);}suggestName(e){var t;const i=(null!==(t=this.nameSuggestions.get(e))&&void 0!==t?t:0)+1;this.nameSuggestions.set(e,i),i>this.mostCommonSuggestion&&(this.mostCommonSuggestion=i,this.suggestedVariableName=e);}warnUnusedImports(){const e=Array.from(this.declarations).filter((([e,t])=>"*"!==e&&!t.included&&!this.reexported&&!t.referenced)).map((([e])=>e));if(0===e.length)return;const t=new Set;for(const i of e)for(const e of this.declarations.get(i).module.importers)t.add(e);const i=[...t];this.options.onwarn({code:"UNUSED_EXTERNAL_IMPORT",message:`${oe(e,["is","are"])} imported from external module "${this.id}" but never used in ${oe(i.map((e=>he(e))))}.`,names:e,source:this.id,sources:i});}}const Te={ArrayPattern(e,t){for(const i of t.elements)i&&Te[i.type](e,i);},AssignmentPattern(e,t){Te[t.left.type](e,t.left);},Identifier(e,t){e.push(t.name);},MemberExpression(){},ObjectPattern(e,t){for(const i of t.properties)"RestElement"===i.type?Te.RestElement(e,i):Te[i.value.type](e,i.value);},RestElement(e,t){Te[t.argument.type](e,t.argument);}},Oe=function(e){const t=[];return Te[e.type](t,e),t};new Set("break case class catch const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield enum await implements package protected static interface private public arguments Infinity NaN undefined null true false eval uneval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent encodeURI encodeURIComponent escape unescape Object Function Boolean Symbol Error EvalError InternalError RangeError ReferenceError SyntaxError TypeError URIError Number Math Date String RegExp Array Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array Map Set WeakMap WeakSet SIMD ArrayBuffer DataView JSON Promise Generator GeneratorFunction Reflect Proxy Intl".split(" ")).add("");function Re(){return {brokenFlow:0,includedCallArguments:new Set,includedLabels:new Set}}function Me(){return {accessed:new U,assigned:new U,brokenFlow:0,called:new H,ignore:{breaks:!1,continues:!1,labels:new Set,returnYield:!1},includedLabels:new Set,instantiated:new H,replacedVariableInits:new Map}}function De(e,t=null){return Object.create(t,e)}const Le=new class extends K{getLiteralValueAtPath(){}},Ve={value:{hasEffectsWhenCalled:null,returns:X}},Be=new class extends K{getReturnExpressionWhenCalledAtPath(e){return 1===e.length?Qe(qe,e[0]):X}hasEffectsOnInteractionAtPath(e,t,i){return 0===t.type?e.length>1:2!==t.type||1!==e.length||Ye(qe,e[0],t,i)}},Fe={value:{hasEffectsWhenCalled:null,returns:Be}},ze=new class extends K{getReturnExpressionWhenCalledAtPath(e){return 1===e.length?Qe(Ke,e[0]):X}hasEffectsOnInteractionAtPath(e,t,i){return 0===t.type?e.length>1:2!==t.type||1!==e.length||Ye(Ke,e[0],t,i)}},je={value:{hasEffectsWhenCalled:null,returns:ze}},Ue=new class extends K{getReturnExpressionWhenCalledAtPath(e){return 1===e.length?Qe(Xe,e[0]):X}hasEffectsOnInteractionAtPath(e,t,i){return 0===t.type?e.length>1:2!==t.type||1!==e.length||Ye(Xe,e[0],t,i)}},Ge={value:{hasEffectsWhenCalled:null,returns:Ue}},He={value:{hasEffectsWhenCalled({args:e},t){const i=e[1];return e.length<2||"symbol"==typeof i.getLiteralValueAtPath(V,G,{deoptimizeCache(){}})&&i.hasEffectsOnInteractionAtPath(V,J,t)},returns:Ue}},We=De({hasOwnProperty:Fe,isPrototypeOf:Fe,propertyIsEnumerable:Fe,toLocaleString:Ge,toString:Ge,valueOf:Ve}),qe=De({valueOf:Fe},We),Ke=De({toExponential:Ge,toFixed:Ge,toLocaleString:Ge,toPrecision:Ge,valueOf:je},We),Xe=De({anchor:Ge,at:Ve,big:Ge,blink:Ge,bold:Ge,charAt:Ge,charCodeAt:je,codePointAt:Ve,concat:Ge,endsWith:Fe,fixed:Ge,fontcolor:Ge,fontsize:Ge,includes:Fe,indexOf:je,italics:Ge,lastIndexOf:je,link:Ge,localeCompare:je,match:Ve,matchAll:Ve,normalize:Ge,padEnd:Ge,padStart:Ge,repeat:Ge,replace:He,replaceAll:He,search:je,slice:Ge,small:Ge,split:Ve,startsWith:Fe,strike:Ge,sub:Ge,substr:Ge,substring:Ge,sup:Ge,toLocaleLowerCase:Ge,toLocaleUpperCase:Ge,toLowerCase:Ge,toString:Ge,toUpperCase:Ge,trim:Ge,trimEnd:Ge,trimLeft:Ge,trimRight:Ge,trimStart:Ge,valueOf:Ge},We);function Ye(e,t,i,s){var n,r;return "string"!=typeof t||!e[t]||((null===(r=(n=e[t]).hasEffectsWhenCalled)||void 0===r?void 0:r.call(n,i,s))||!1)}function Qe(e,t){return "string"==typeof t&&e[t]?e[t].returns:X}function Ze(e,t,i){i(e,t);}function Je(e,t,i){}var et={};et.Program=et.BlockStatement=et.StaticBlock=function(e,t,i){for(var s=0,n=e.body;s<n.length;s+=1){i(n[s],t,"Statement");}},et.Statement=Ze,et.EmptyStatement=Je,et.ExpressionStatement=et.ParenthesizedExpression=et.ChainExpression=function(e,t,i){return i(e.expression,t,"Expression")},et.IfStatement=function(e,t,i){i(e.test,t,"Expression"),i(e.consequent,t,"Statement"),e.alternate&&i(e.alternate,t,"Statement");},et.LabeledStatement=function(e,t,i){return i(e.body,t,"Statement")},et.BreakStatement=et.ContinueStatement=Je,et.WithStatement=function(e,t,i){i(e.object,t,"Expression"),i(e.body,t,"Statement");},et.SwitchStatement=function(e,t,i){i(e.discriminant,t,"Expression");for(var s=0,n=e.cases;s<n.length;s+=1){var r=n[s];r.test&&i(r.test,t,"Expression");for(var a=0,o=r.consequent;a<o.length;a+=1){i(o[a],t,"Statement");}}},et.SwitchCase=function(e,t,i){e.test&&i(e.test,t,"Expression");for(var s=0,n=e.consequent;s<n.length;s+=1){i(n[s],t,"Statement");}},et.ReturnStatement=et.YieldExpression=et.AwaitExpression=function(e,t,i){e.argument&&i(e.argument,t,"Expression");},et.ThrowStatement=et.SpreadElement=function(e,t,i){return i(e.argument,t,"Expression")},et.TryStatement=function(e,t,i){i(e.block,t,"Statement"),e.handler&&i(e.handler,t),e.finalizer&&i(e.finalizer,t,"Statement");},et.CatchClause=function(e,t,i){e.param&&i(e.param,t,"Pattern"),i(e.body,t,"Statement");},et.WhileStatement=et.DoWhileStatement=function(e,t,i){i(e.test,t,"Expression"),i(e.body,t,"Statement");},et.ForStatement=function(e,t,i){e.init&&i(e.init,t,"ForInit"),e.test&&i(e.test,t,"Expression"),e.update&&i(e.update,t,"Expression"),i(e.body,t,"Statement");},et.ForInStatement=et.ForOfStatement=function(e,t,i){i(e.left,t,"ForInit"),i(e.right,t,"Expression"),i(e.body,t,"Statement");},et.ForInit=function(e,t,i){"VariableDeclaration"===e.type?i(e,t):i(e,t,"Expression");},et.DebuggerStatement=Je,et.FunctionDeclaration=function(e,t,i){return i(e,t,"Function")},et.VariableDeclaration=function(e,t,i){for(var s=0,n=e.declarations;s<n.length;s+=1){i(n[s],t);}},et.VariableDeclarator=function(e,t,i){i(e.id,t,"Pattern"),e.init&&i(e.init,t,"Expression");},et.Function=function(e,t,i){e.id&&i(e.id,t,"Pattern");for(var s=0,n=e.params;s<n.length;s+=1){i(n[s],t,"Pattern");}i(e.body,t,e.expression?"Expression":"Statement");},et.Pattern=function(e,t,i){"Identifier"===e.type?i(e,t,"VariablePattern"):"MemberExpression"===e.type?i(e,t,"MemberPattern"):i(e,t);},et.VariablePattern=Je,et.MemberPattern=Ze,et.RestElement=function(e,t,i){return i(e.argument,t,"Pattern")},et.ArrayPattern=function(e,t,i){for(var s=0,n=e.elements;s<n.length;s+=1){var r=n[s];r&&i(r,t,"Pattern");}},et.ObjectPattern=function(e,t,i){for(var s=0,n=e.properties;s<n.length;s+=1){var r=n[s];"Property"===r.type?(r.computed&&i(r.key,t,"Expression"),i(r.value,t,"Pattern")):"RestElement"===r.type&&i(r.argument,t,"Pattern");}},et.Expression=Ze,et.ThisExpression=et.Super=et.MetaProperty=Je,et.ArrayExpression=function(e,t,i){for(var s=0,n=e.elements;s<n.length;s+=1){var r=n[s];r&&i(r,t,"Expression");}},et.ObjectExpression=function(e,t,i){for(var s=0,n=e.properties;s<n.length;s+=1){i(n[s],t);}},et.FunctionExpression=et.ArrowFunctionExpression=et.FunctionDeclaration,et.SequenceExpression=function(e,t,i){for(var s=0,n=e.expressions;s<n.length;s+=1){i(n[s],t,"Expression");}},et.TemplateLiteral=function(e,t,i){for(var s=0,n=e.quasis;s<n.length;s+=1){i(n[s],t);}for(var r=0,a=e.expressions;r<a.length;r+=1){i(a[r],t,"Expression");}},et.TemplateElement=Je,et.UnaryExpression=et.UpdateExpression=function(e,t,i){i(e.argument,t,"Expression");},et.BinaryExpression=et.LogicalExpression=function(e,t,i){i(e.left,t,"Expression"),i(e.right,t,"Expression");},et.AssignmentExpression=et.AssignmentPattern=function(e,t,i){i(e.left,t,"Pattern"),i(e.right,t,"Expression");},et.ConditionalExpression=function(e,t,i){i(e.test,t,"Expression"),i(e.consequent,t,"Expression"),i(e.alternate,t,"Expression");},et.NewExpression=et.CallExpression=function(e,t,i){if(i(e.callee,t,"Expression"),e.arguments)for(var s=0,n=e.arguments;s<n.length;s+=1){i(n[s],t,"Expression");}},et.MemberExpression=function(e,t,i){i(e.object,t,"Expression"),e.computed&&i(e.property,t,"Expression");},et.ExportNamedDeclaration=et.ExportDefaultDeclaration=function(e,t,i){e.declaration&&i(e.declaration,t,"ExportNamedDeclaration"===e.type||e.declaration.id?"Statement":"Expression"),e.source&&i(e.source,t,"Expression");},et.ExportAllDeclaration=function(e,t,i){e.exported&&i(e.exported,t),i(e.source,t,"Expression");},et.ImportDeclaration=function(e,t,i){for(var s=0,n=e.specifiers;s<n.length;s+=1){i(n[s],t);}i(e.source,t,"Expression");},et.ImportExpression=function(e,t,i){i(e.source,t,"Expression");},et.ImportSpecifier=et.ImportDefaultSpecifier=et.ImportNamespaceSpecifier=et.Identifier=et.PrivateIdentifier=et.Literal=Je,et.TaggedTemplateExpression=function(e,t,i){i(e.tag,t,"Expression"),i(e.quasi,t,"Expression");},et.ClassDeclaration=et.ClassExpression=function(e,t,i){return i(e,t,"Class")},et.Class=function(e,t,i){e.id&&i(e.id,t,"Pattern"),e.superClass&&i(e.superClass,t,"Expression"),i(e.body,t);},et.ClassBody=function(e,t,i){for(var s=0,n=e.body;s<n.length;s+=1){i(n[s],t);}},et.MethodDefinition=et.PropertyDefinition=et.Property=function(e,t,i){e.computed&&i(e.key,t,"Expression"),e.value&&i(e.value,t,"Expression");};const it=new RegExp("^#[ \\f\\r\\t\\v\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+sourceMappingURL=.+");function st(e,t,i=e.type){const{annotations:s}=t;let n=s[t.annotationIndex];for(;n&&e.start>=n.end;)at(e,n,t.code),n=s[++t.annotationIndex];if(n&&n.end<=e.end)for(et[i](e,t,st);(n=s[t.annotationIndex])&&n.end<=e.end;)++t.annotationIndex,ht(e,n,!1);}const nt=/[^\s(]/g,rt=/\S/g;function at(e,t,i){const s=[];let n;if(ot(i.slice(t.end,e.start),nt)){const t=e.start;for(;;){switch(s.push(e),e.type){case"ExpressionStatement":case"ChainExpression":e=e.expression;continue;case"SequenceExpression":if(ot(i.slice(t,e.start),rt)){e=e.expressions[0];continue}n=!0;break;case"ConditionalExpression":if(ot(i.slice(t,e.start),rt)){e=e.test;continue}n=!0;break;case"LogicalExpression":case"BinaryExpression":if(ot(i.slice(t,e.start),rt)){e=e.left;continue}n=!0;break;case"CallExpression":case"NewExpression":break;default:n=!0;}break}}else n=!0;if(n)ht(e,t,!1);else for(const e of s)ht(e,t,!0);}function ot(e,t){let i;for(;null!==(i=t.exec(e));){if("/"===i[0]){const i=e.charCodeAt(t.lastIndex);if(42===i){t.lastIndex=e.indexOf("*/",t.lastIndex+1)+2;continue}if(47===i){t.lastIndex=e.indexOf("\n",t.lastIndex+1)+1;continue}}return t.lastIndex=0,!1}return !0}const lt=/[@#]__PURE__/;function ht(e,t,i){const s=i?"_rollupAnnotations":"_rollupRemoved",n=e[s];n?n.push(t):e[s]=[t];}const ct={Literal:[],Program:["body"]};class ut extends K{constructor(e,t,i){super(),this.deoptimized=!1,this.esTreeNode=e,this.keys=ct[e.type]||function(e){return ct[e.type]=Object.keys(e).filter((t=>"object"==typeof e[t]&&95!==t.charCodeAt(0))),ct[e.type]}(e),this.parent=t,this.context=t.context,this.createScope(i),this.parseNode(e),this.initialise(),this.context.magicString.addSourcemapLocation(this.start),this.context.magicString.addSourcemapLocation(this.end);}addExportedVariables(e,t){}bind(){for(const e of this.keys){const t=this[e];if(null!==t)if(Array.isArray(t))for(const e of t)null==e||e.bind();else t.bind();}}createScope(e){this.scope=e;}hasEffects(e){this.deoptimized||this.applyDeoptimizations();for(const t of this.keys){const i=this[t];if(null!==i)if(Array.isArray(i)){for(const t of i)if(null==t?void 0:t.hasEffects(e))return !0}else if(i.hasEffects(e))return !0}return !1}hasEffectsAsAssignmentTarget(e,t){return this.hasEffects(e)||this.hasEffectsOnInteractionAtPath(V,this.assignmentInteraction,e)}include(e,t,i){this.deoptimized||this.applyDeoptimizations(),this.included=!0;for(const i of this.keys){const s=this[i];if(null!==s)if(Array.isArray(s))for(const i of s)null==i||i.include(e,t);else s.include(e,t);}}includeAsAssignmentTarget(e,t,i){this.include(e,t);}initialise(){}insertSemicolon(e){";"!==e.original[this.end-1]&&e.appendLeft(this.end,";");}parseNode(e){for(const[t,i]of Object.entries(e))if(!this.hasOwnProperty(t))if(95===t.charCodeAt(0)){if("_rollupAnnotations"===t)this.annotations=i;else if("_rollupRemoved"===t)for(const{start:e,end:t}of i)this.context.magicString.remove(e,t);}else if("object"!=typeof i||null===i)this[t]=i;else if(Array.isArray(i)){this[t]=[];for(const e of i)this[t].push(null===e?null:new(this.context.getNodeConstructor(e.type))(e,this,this.scope));}else this[t]=new(this.context.getNodeConstructor(i.type))(i,this,this.scope);}render(e,t){for(const i of this.keys){const s=this[i];if(null!==s)if(Array.isArray(s))for(const i of s)null==i||i.render(e,t);else s.render(e,t);}}setAssignedValue(e){this.assignmentInteraction={args:[e],thisArg:null,type:1};}shouldBeIncluded(e){return this.included||!e.brokenFlow&&this.hasEffects(Me())}applyDeoptimizations(){this.deoptimized=!0;for(const e of this.keys){const t=this[e];if(null!==t)if(Array.isArray(t))for(const e of t)null==e||e.deoptimizePath(B);else t.deoptimizePath(B);}this.context.requestTreeshakingPass();}}class dt extends ut{deoptimizeThisOnInteractionAtPath(e,t,i){t.length>0&&this.argument.deoptimizeThisOnInteractionAtPath(e,[M,...t],i);}hasEffects(e){this.deoptimized||this.applyDeoptimizations();const{propertyReadSideEffects:t}=this.context.options.treeshake;return this.argument.hasEffects(e)||t&&("always"===t||this.argument.hasEffectsOnInteractionAtPath(B,Y,e))}applyDeoptimizations(){this.deoptimized=!0,this.argument.deoptimizePath([M,M]),this.context.requestTreeshakingPass();}}class pt extends K{constructor(e){super(),this.description=e;}deoptimizeThisOnInteractionAtPath({type:e,thisArg:t},i){2===e&&0===i.length&&this.description.mutatesSelfAsArray&&t.deoptimizePath(z);}getReturnExpressionWhenCalledAtPath(e,{thisArg:t}){return e.length>0?X:this.description.returnsPrimitive||("self"===this.description.returns?t||X:this.description.returns())}hasEffectsOnInteractionAtPath(e,t,i){var s,n;const{type:r}=t;if(e.length>(0===r?1:0))return !0;if(2===r){if(!0===this.description.mutatesSelfAsArray&&(null===(s=t.thisArg)||void 0===s?void 0:s.hasEffectsOnInteractionAtPath(z,Q,i)))return !0;if(this.description.callsArgs)for(const e of this.description.callsArgs)if(null===(n=t.args[e])||void 0===n?void 0:n.hasEffectsOnInteractionAtPath(V,J,i))return !0}return !1}}const ft=[new pt({callsArgs:null,mutatesSelfAsArray:!1,returns:null,returnsPrimitive:Be})],mt=[new pt({callsArgs:null,mutatesSelfAsArray:!1,returns:null,returnsPrimitive:Ue})],gt=[new pt({callsArgs:null,mutatesSelfAsArray:!1,returns:null,returnsPrimitive:ze})],yt=[new pt({callsArgs:null,mutatesSelfAsArray:!1,returns:null,returnsPrimitive:X})],xt=/^\d+$/;class Et extends K{constructor(e,t,i=!1){if(super(),this.prototypeExpression=t,this.immutable=i,this.allProperties=[],this.deoptimizedPaths=Object.create(null),this.expressionsToBeDeoptimizedByKey=Object.create(null),this.gettersByKey=Object.create(null),this.hasLostTrack=!1,this.hasUnknownDeoptimizedInteger=!1,this.hasUnknownDeoptimizedProperty=!1,this.propertiesAndGettersByKey=Object.create(null),this.propertiesAndSettersByKey=Object.create(null),this.settersByKey=Object.create(null),this.thisParametersToBeDeoptimized=new Set,this.unknownIntegerProps=[],this.unmatchableGetters=[],this.unmatchablePropertiesAndGetters=[],this.unmatchableSetters=[],Array.isArray(e))this.buildPropertyMaps(e);else {this.propertiesAndGettersByKey=this.propertiesAndSettersByKey=e;for(const t of Object.values(e))this.allProperties.push(...t);}}deoptimizeAllProperties(e){var t;const i=this.hasLostTrack||this.hasUnknownDeoptimizedProperty;if(e?this.hasUnknownDeoptimizedProperty=!0:this.hasLostTrack=!0,!i){for(const e of Object.values(this.propertiesAndGettersByKey).concat(Object.values(this.settersByKey)))for(const t of e)t.deoptimizePath(B);null===(t=this.prototypeExpression)||void 0===t||t.deoptimizePath([M,M]),this.deoptimizeCachedEntities();}}deoptimizeIntegerProperties(){if(!(this.hasLostTrack||this.hasUnknownDeoptimizedProperty||this.hasUnknownDeoptimizedInteger)){this.hasUnknownDeoptimizedInteger=!0;for(const[e,t]of Object.entries(this.propertiesAndGettersByKey))if(xt.test(e))for(const e of t)e.deoptimizePath(B);this.deoptimizeCachedIntegerEntities();}}deoptimizePath(e){var t;if(this.hasLostTrack||this.immutable)return;const i=e[0];if(1===e.length){if("string"!=typeof i)return i===L?this.deoptimizeIntegerProperties():this.deoptimizeAllProperties(i===D);if(!this.deoptimizedPaths[i]){this.deoptimizedPaths[i]=!0;const e=this.expressionsToBeDeoptimizedByKey[i];if(e)for(const t of e)t.deoptimizeCache();}}const s=1===e.length?B:e.slice(1);for(const e of "string"==typeof i?(this.propertiesAndGettersByKey[i]||this.unmatchablePropertiesAndGetters).concat(this.settersByKey[i]||this.unmatchableSetters):this.allProperties)e.deoptimizePath(s);null===(t=this.prototypeExpression)||void 0===t||t.deoptimizePath(1===e.length?[...e,M]:e);}deoptimizeThisOnInteractionAtPath(e,t,i){var s;const[n,...r]=t;if(this.hasLostTrack||(2===e.type||t.length>1)&&(this.hasUnknownDeoptimizedProperty||"string"==typeof n&&this.deoptimizedPaths[n]))return void e.thisArg.deoptimizePath(B);const[a,o,l]=2===e.type||t.length>1?[this.propertiesAndGettersByKey,this.propertiesAndGettersByKey,this.unmatchablePropertiesAndGetters]:0===e.type?[this.propertiesAndGettersByKey,this.gettersByKey,this.unmatchableGetters]:[this.propertiesAndSettersByKey,this.settersByKey,this.unmatchableSetters];if("string"==typeof n){if(a[n]){const t=o[n];if(t)for(const s of t)s.deoptimizeThisOnInteractionAtPath(e,r,i);return void(this.immutable||this.thisParametersToBeDeoptimized.add(e.thisArg))}for(const t of l)t.deoptimizeThisOnInteractionAtPath(e,r,i);if(xt.test(n))for(const t of this.unknownIntegerProps)t.deoptimizeThisOnInteractionAtPath(e,r,i);}else {for(const t of Object.values(o).concat([l]))for(const s of t)s.deoptimizeThisOnInteractionAtPath(e,r,i);for(const t of this.unknownIntegerProps)t.deoptimizeThisOnInteractionAtPath(e,r,i);}this.immutable||this.thisParametersToBeDeoptimized.add(e.thisArg),null===(s=this.prototypeExpression)||void 0===s||s.deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){if(0===e.length)return q;const s=e[0],n=this.getMemberExpressionAndTrackDeopt(s,i);return n?n.getLiteralValueAtPath(e.slice(1),t,i):this.prototypeExpression?this.prototypeExpression.getLiteralValueAtPath(e,t,i):1!==e.length?W:void 0}getReturnExpressionWhenCalledAtPath(e,t,i,s){if(0===e.length)return X;const[n,...r]=e,a=this.getMemberExpressionAndTrackDeopt(n,s);return a?a.getReturnExpressionWhenCalledAtPath(r,t,i,s):this.prototypeExpression?this.prototypeExpression.getReturnExpressionWhenCalledAtPath(e,t,i,s):X}hasEffectsOnInteractionAtPath(e,t,i){const[s,...n]=e;if(n.length||2===t.type){const r=this.getMemberExpression(s);return r?r.hasEffectsOnInteractionAtPath(n,t,i):!this.prototypeExpression||this.prototypeExpression.hasEffectsOnInteractionAtPath(e,t,i)}if(s===D)return !1;if(this.hasLostTrack)return !0;const[r,a,o]=0===t.type?[this.propertiesAndGettersByKey,this.gettersByKey,this.unmatchableGetters]:[this.propertiesAndSettersByKey,this.settersByKey,this.unmatchableSetters];if("string"==typeof s){if(r[s]){const e=a[s];if(e)for(const s of e)if(s.hasEffectsOnInteractionAtPath(n,t,i))return !0;return !1}for(const e of o)if(e.hasEffectsOnInteractionAtPath(n,t,i))return !0}else for(const e of Object.values(a).concat([o]))for(const s of e)if(s.hasEffectsOnInteractionAtPath(n,t,i))return !0;return !!this.prototypeExpression&&this.prototypeExpression.hasEffectsOnInteractionAtPath(e,t,i)}buildPropertyMaps(e){const{allProperties:t,propertiesAndGettersByKey:i,propertiesAndSettersByKey:s,settersByKey:n,gettersByKey:r,unknownIntegerProps:a,unmatchablePropertiesAndGetters:o,unmatchableGetters:l,unmatchableSetters:h}=this,c=[];for(let u=e.length-1;u>=0;u--){const{key:d,kind:p,property:f}=e[u];if(t.push(f),"string"!=typeof d){if(d===L){a.push(f);continue}"set"===p&&h.push(f),"get"===p&&l.push(f),"get"!==p&&c.push(f),"set"!==p&&o.push(f);}else "set"===p?s[d]||(s[d]=[f,...c],n[d]=[f,...h]):"get"===p?i[d]||(i[d]=[f,...o],r[d]=[f,...l]):(s[d]||(s[d]=[f,...c]),i[d]||(i[d]=[f,...o]));}}deoptimizeCachedEntities(){for(const e of Object.values(this.expressionsToBeDeoptimizedByKey))for(const t of e)t.deoptimizeCache();for(const e of this.thisParametersToBeDeoptimized)e.deoptimizePath(B);}deoptimizeCachedIntegerEntities(){for(const[e,t]of Object.entries(this.expressionsToBeDeoptimizedByKey))if(xt.test(e))for(const e of t)e.deoptimizeCache();for(const e of this.thisParametersToBeDeoptimized)e.deoptimizePath(z);}getMemberExpression(e){if(this.hasLostTrack||this.hasUnknownDeoptimizedProperty||"string"!=typeof e||this.hasUnknownDeoptimizedInteger&&xt.test(e)||this.deoptimizedPaths[e])return X;const t=this.propertiesAndGettersByKey[e];return 1===(null==t?void 0:t.length)?t[0]:t||this.unmatchablePropertiesAndGetters.length>0||this.unknownIntegerProps.length&&xt.test(e)?X:null}getMemberExpressionAndTrackDeopt(e,t){if("string"!=typeof e)return X;const i=this.getMemberExpression(e);if(i!==X&&!this.immutable){(this.expressionsToBeDeoptimizedByKey[e]=this.expressionsToBeDeoptimizedByKey[e]||[]).push(t);}return i}}const bt=e=>"string"==typeof e&&/^\d+$/.test(e),vt=new class extends K{deoptimizeThisOnInteractionAtPath({type:e,thisArg:t},i){2!==e||1!==i.length||bt(i[0])||t.deoptimizePath(B);}getLiteralValueAtPath(e){return 1===e.length&&bt(e[0])?void 0:W}hasEffectsOnInteractionAtPath(e,{type:t}){return e.length>1||2===t}},St=new Et({__proto__:null,hasOwnProperty:ft,isPrototypeOf:ft,propertyIsEnumerable:ft,toLocaleString:mt,toString:mt,valueOf:yt},vt,!0),At=[{key:L,kind:"init",property:X},{key:"length",kind:"init",property:ze}],It=[new pt({callsArgs:[0],mutatesSelfAsArray:"deopt-only",returns:null,returnsPrimitive:Be})],kt=[new pt({callsArgs:[0],mutatesSelfAsArray:"deopt-only",returns:null,returnsPrimitive:ze})],Pt=[new pt({callsArgs:null,mutatesSelfAsArray:!0,returns:()=>new Et(At,Mt),returnsPrimitive:null})],wt=[new pt({callsArgs:null,mutatesSelfAsArray:"deopt-only",returns:()=>new Et(At,Mt),returnsPrimitive:null})],Ct=[new pt({callsArgs:[0],mutatesSelfAsArray:"deopt-only",returns:()=>new Et(At,Mt),returnsPrimitive:null})],_t=[new pt({callsArgs:null,mutatesSelfAsArray:!0,returns:null,returnsPrimitive:ze})],Nt=[new pt({callsArgs:null,mutatesSelfAsArray:!0,returns:null,returnsPrimitive:X})],$t=[new pt({callsArgs:null,mutatesSelfAsArray:"deopt-only",returns:null,returnsPrimitive:X})],Tt=[new pt({callsArgs:[0],mutatesSelfAsArray:"deopt-only",returns:null,returnsPrimitive:X})],Ot=[new pt({callsArgs:null,mutatesSelfAsArray:!0,returns:"self",returnsPrimitive:null})],Rt=[new pt({callsArgs:[0],mutatesSelfAsArray:!0,returns:"self",returnsPrimitive:null})],Mt=new Et({__proto__:null,at:$t,concat:wt,copyWithin:Ot,entries:wt,every:It,fill:Ot,filter:Ct,find:Tt,findIndex:kt,findLast:Tt,findLastIndex:kt,flat:wt,flatMap:Ct,forEach:Tt,group:Tt,groupToMap:Tt,includes:ft,indexOf:gt,join:mt,keys:yt,lastIndexOf:gt,map:Ct,pop:Nt,push:_t,reduce:Tt,reduceRight:Tt,reverse:Ot,shift:Nt,slice:wt,some:It,sort:Rt,splice:Pt,toLocaleString:mt,toString:mt,unshift:_t,values:$t},St,!0);class Dt extends ee{constructor(e,t,i,s){super(e),this.calledFromTryStatement=!1,this.additionalInitializers=null,this.expressionsToBeDeoptimized=[],this.declarations=t?[t]:[],this.init=i,this.deoptimizationTracker=s.deoptimizationTracker,this.module=s.module;}addDeclaration(e,t){this.declarations.push(e);const i=this.markInitializersForDeoptimization();null!==t&&i.push(t);}consolidateInitializers(){if(null!==this.additionalInitializers){for(const e of this.additionalInitializers)e.deoptimizePath(B);this.additionalInitializers=null;}}deoptimizePath(e){var t,i;if(!this.isReassigned&&!this.deoptimizationTracker.trackEntityAtPathAndGetIfTracked(e,this))if(0===e.length){if(!this.isReassigned){this.isReassigned=!0;const e=this.expressionsToBeDeoptimized;this.expressionsToBeDeoptimized=[];for(const t of e)t.deoptimizeCache();null===(t=this.init)||void 0===t||t.deoptimizePath(B);}}else null===(i=this.init)||void 0===i||i.deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){if(this.isReassigned||!this.init)return e.thisArg.deoptimizePath(B);i.withTrackedEntityAtPath(t,this.init,(()=>this.init.deoptimizeThisOnInteractionAtPath(e,t,i)),void 0);}getLiteralValueAtPath(e,t,i){return this.isReassigned||!this.init?W:t.withTrackedEntityAtPath(e,this.init,(()=>(this.expressionsToBeDeoptimized.push(i),this.init.getLiteralValueAtPath(e,t,i))),W)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.isReassigned||!this.init?X:i.withTrackedEntityAtPath(e,this.init,(()=>(this.expressionsToBeDeoptimized.push(s),this.init.getReturnExpressionWhenCalledAtPath(e,t,i,s))),X)}hasEffectsOnInteractionAtPath(e,t,i){switch(t.type){case 0:return !!this.isReassigned||this.init&&!i.accessed.trackEntityAtPathAndGetIfTracked(e,this)&&this.init.hasEffectsOnInteractionAtPath(e,t,i);case 1:return !!this.included||0!==e.length&&(!!this.isReassigned||this.init&&!i.assigned.trackEntityAtPathAndGetIfTracked(e,this)&&this.init.hasEffectsOnInteractionAtPath(e,t,i));case 2:return !!this.isReassigned||this.init&&!(t.withNew?i.instantiated:i.called).trackEntityAtPathAndGetIfTracked(e,t.args,this)&&this.init.hasEffectsOnInteractionAtPath(e,t,i)}}include(){if(!this.included){this.included=!0;for(const e of this.declarations){e.included||e.include(Re(),!1);let t=e.parent;for(;!t.included&&(t.included=!0,"Program"!==t.type);)t=t.parent;}}}includeCallArguments(e,t){if(this.isReassigned||this.init&&e.includedCallArguments.has(this.init))for(const i of t)i.include(e,!1);else this.init&&(e.includedCallArguments.add(this.init),this.init.includeCallArguments(e,t),e.includedCallArguments.delete(this.init));}markCalledFromTryStatement(){this.calledFromTryStatement=!0;}markInitializersForDeoptimization(){return null===this.additionalInitializers&&(this.additionalInitializers=null===this.init?[]:[this.init],this.init=X,this.isReassigned=!0),this.additionalInitializers}}function Lt(e){let t="";do{const i=e%64;e=Math.floor(e/64),t="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$"[i]+t;}while(0!==e);return t}function Vt(e,t){let i=e,s=1;for(;t.has(i)||we.has(i);)i=`${e}$${Lt(s++)}`;return t.add(i),i}class Bt{constructor(){this.children=[],this.variables=new Map;}addDeclaration(e,t,i,s){const n=e.name;let r=this.variables.get(n);return r?r.addDeclaration(e,i):(r=new Dt(e.name,e,i||Le,t),this.variables.set(n,r)),r}contains(e){return this.variables.has(e)}findVariable(e){throw new Error("Internal Error: findVariable needs to be implemented by a subclass")}}class Ft extends Bt{constructor(e){super(),this.accessedOutsideVariables=new Map,this.parent=e,e.children.push(this);}addAccessedDynamicImport(e){(this.accessedDynamicImports||(this.accessedDynamicImports=new Set)).add(e),this.parent instanceof Ft&&this.parent.addAccessedDynamicImport(e);}addAccessedGlobals(e,t){const i=t.get(this)||new Set;for(const t of e)i.add(t);t.set(this,i),this.parent instanceof Ft&&this.parent.addAccessedGlobals(e,t);}addNamespaceMemberAccess(e,t){this.accessedOutsideVariables.set(e,t),this.parent.addNamespaceMemberAccess(e,t);}addReturnExpression(e){this.parent instanceof Ft&&this.parent.addReturnExpression(e);}addUsedOutsideNames(e,t,i,s){for(const s of this.accessedOutsideVariables.values())s.included&&(e.add(s.getBaseVariableName()),"system"===t&&i.has(s)&&e.add("exports"));const n=s.get(this);if(n)for(const t of n)e.add(t);}contains(e){return this.variables.has(e)||this.parent.contains(e)}deconflict(e,t,i){const s=new Set;if(this.addUsedOutsideNames(s,e,t,i),this.accessedDynamicImports)for(const e of this.accessedDynamicImports)e.inlineNamespace&&s.add(e.inlineNamespace.getBaseVariableName());for(const[e,t]of this.variables)(t.included||t.alwaysRendered)&&t.setRenderNames(null,Vt(e,s));for(const s of this.children)s.deconflict(e,t,i);}findLexicalBoundary(){return this.parent.findLexicalBoundary()}findVariable(e){const t=this.variables.get(e)||this.accessedOutsideVariables.get(e);if(t)return t;const i=this.parent.findVariable(e);return this.accessedOutsideVariables.set(e,i),i}}class zt extends Ft{constructor(e,t){super(e),this.parameters=[],this.hasRest=!1,this.context=t,this.hoistedBodyVarScope=new Ft(this);}addParameterDeclaration(e){const t=e.name;let i=this.hoistedBodyVarScope.variables.get(t);return i?i.addDeclaration(e,null):i=new Dt(t,e,X,this.context),this.variables.set(t,i),i}addParameterVariables(e,t){this.parameters=e;for(const t of e)for(const e of t)e.alwaysRendered=!0;this.hasRest=t;}includeCallArguments(e,t){let i=!1,s=!1;const n=this.hasRest&&this.parameters[this.parameters.length-1];for(const i of t)if(i instanceof dt){for(const i of t)i.include(e,!1);break}for(let r=t.length-1;r>=0;r--){const a=this.parameters[r]||n,o=t[r];if(a)if(i=!1,0===a.length)s=!0;else for(const e of a)e.included&&(s=!0),e.calledFromTryStatement&&(i=!0);!s&&o.shouldBeIncluded(e)&&(s=!0),s&&o.include(e,i);}}}class jt extends zt{constructor(){super(...arguments),this.returnExpression=null,this.returnExpressions=[];}addReturnExpression(e){this.returnExpressions.push(e);}getReturnExpression(){return null===this.returnExpression&&this.updateReturnExpression(),this.returnExpression}updateReturnExpression(){if(1===this.returnExpressions.length)this.returnExpression=this.returnExpressions[0];else {this.returnExpression=X;for(const e of this.returnExpressions)e.deoptimizePath(B);}}}function Ut(e,t){if("MemberExpression"===e.type)return !e.computed&&Ut(e.object,e);if("Identifier"===e.type){if(!t)return !0;switch(t.type){case"MemberExpression":return t.computed||e===t.object;case"MethodDefinition":return t.computed;case"PropertyDefinition":case"Property":return t.computed||e===t.value;case"ExportSpecifier":case"ImportSpecifier":return e===t.local;case"LabeledStatement":case"BreakStatement":case"ContinueStatement":return !1;default:return !0}}return !1}const Gt=Symbol("Value Properties"),Ht={hasEffectsWhenCalled:()=>!1},Wt={hasEffectsWhenCalled:()=>!0},qt={__proto__:null,[Gt]:Wt},Kt={__proto__:null,[Gt]:Ht},Xt={__proto__:null,[Gt]:{hasEffectsWhenCalled:({args:e},t)=>!e.length||e[0].hasEffectsOnInteractionAtPath(F,Q,t)}},Yt={__proto__:null,[Gt]:Wt,prototype:qt},Qt={__proto__:null,[Gt]:Ht,prototype:qt},Zt={__proto__:null,[Gt]:Ht,from:Kt,of:Kt,prototype:qt},Jt={__proto__:null,[Gt]:Ht,supportedLocalesOf:Qt},ei={global:qt,globalThis:qt,self:qt,window:qt,__proto__:null,[Gt]:Wt,Array:{__proto__:null,[Gt]:Wt,from:qt,isArray:Kt,of:Kt,prototype:qt},ArrayBuffer:{__proto__:null,[Gt]:Ht,isView:Kt,prototype:qt},Atomics:qt,BigInt:Yt,BigInt64Array:Yt,BigUint64Array:Yt,Boolean:Qt,constructor:Yt,DataView:Qt,Date:{__proto__:null,[Gt]:Ht,now:Kt,parse:Kt,prototype:qt,UTC:Kt},decodeURI:Kt,decodeURIComponent:Kt,encodeURI:Kt,encodeURIComponent:Kt,Error:Qt,escape:Kt,eval:qt,EvalError:Qt,Float32Array:Zt,Float64Array:Zt,Function:Yt,hasOwnProperty:qt,Infinity:qt,Int16Array:Zt,Int32Array:Zt,Int8Array:Zt,isFinite:Kt,isNaN:Kt,isPrototypeOf:qt,JSON:qt,Map:Qt,Math:{__proto__:null,[Gt]:Wt,abs:Kt,acos:Kt,acosh:Kt,asin:Kt,asinh:Kt,atan:Kt,atan2:Kt,atanh:Kt,cbrt:Kt,ceil:Kt,clz32:Kt,cos:Kt,cosh:Kt,exp:Kt,expm1:Kt,floor:Kt,fround:Kt,hypot:Kt,imul:Kt,log:Kt,log10:Kt,log1p:Kt,log2:Kt,max:Kt,min:Kt,pow:Kt,random:Kt,round:Kt,sign:Kt,sin:Kt,sinh:Kt,sqrt:Kt,tan:Kt,tanh:Kt,trunc:Kt},NaN:qt,Number:{__proto__:null,[Gt]:Ht,isFinite:Kt,isInteger:Kt,isNaN:Kt,isSafeInteger:Kt,parseFloat:Kt,parseInt:Kt,prototype:qt},Object:{__proto__:null,[Gt]:Ht,create:Kt,defineProperty:Xt,defineProperties:Xt,getOwnPropertyDescriptor:Kt,getOwnPropertyNames:Kt,getOwnPropertySymbols:Kt,getPrototypeOf:Kt,hasOwn:Kt,is:Kt,isExtensible:Kt,isFrozen:Kt,isSealed:Kt,keys:Kt,fromEntries:Kt,entries:Kt,prototype:qt},parseFloat:Kt,parseInt:Kt,Promise:{__proto__:null,[Gt]:Wt,all:qt,prototype:qt,race:qt,reject:qt,resolve:qt},propertyIsEnumerable:qt,Proxy:qt,RangeError:Qt,ReferenceError:Qt,Reflect:qt,RegExp:Qt,Set:Qt,SharedArrayBuffer:Yt,String:{__proto__:null,[Gt]:Ht,fromCharCode:Kt,fromCodePoint:Kt,prototype:qt,raw:Kt},Symbol:{__proto__:null,[Gt]:Ht,for:Kt,keyFor:Kt,prototype:qt},SyntaxError:Qt,toLocaleString:qt,toString:qt,TypeError:Qt,Uint16Array:Zt,Uint32Array:Zt,Uint8Array:Zt,Uint8ClampedArray:Zt,unescape:Kt,URIError:Qt,valueOf:qt,WeakMap:Qt,WeakSet:Qt,clearInterval:Yt,clearTimeout:Yt,console:qt,Intl:{__proto__:null,[Gt]:Wt,Collator:Jt,DateTimeFormat:Jt,ListFormat:Jt,NumberFormat:Jt,PluralRules:Jt,RelativeTimeFormat:Jt},setInterval:Yt,setTimeout:Yt,TextDecoder:Yt,TextEncoder:Yt,URL:Yt,URLSearchParams:Yt,AbortController:Yt,AbortSignal:Yt,addEventListener:qt,alert:qt,AnalyserNode:Yt,Animation:Yt,AnimationEvent:Yt,applicationCache:qt,ApplicationCache:Yt,ApplicationCacheErrorEvent:Yt,atob:qt,Attr:Yt,Audio:Yt,AudioBuffer:Yt,AudioBufferSourceNode:Yt,AudioContext:Yt,AudioDestinationNode:Yt,AudioListener:Yt,AudioNode:Yt,AudioParam:Yt,AudioProcessingEvent:Yt,AudioScheduledSourceNode:Yt,AudioWorkletNode:Yt,BarProp:Yt,BaseAudioContext:Yt,BatteryManager:Yt,BeforeUnloadEvent:Yt,BiquadFilterNode:Yt,Blob:Yt,BlobEvent:Yt,blur:qt,BroadcastChannel:Yt,btoa:qt,ByteLengthQueuingStrategy:Yt,Cache:Yt,caches:qt,CacheStorage:Yt,cancelAnimationFrame:qt,cancelIdleCallback:qt,CanvasCaptureMediaStreamTrack:Yt,CanvasGradient:Yt,CanvasPattern:Yt,CanvasRenderingContext2D:Yt,ChannelMergerNode:Yt,ChannelSplitterNode:Yt,CharacterData:Yt,clientInformation:qt,ClipboardEvent:Yt,close:qt,closed:qt,CloseEvent:Yt,Comment:Yt,CompositionEvent:Yt,confirm:qt,ConstantSourceNode:Yt,ConvolverNode:Yt,CountQueuingStrategy:Yt,createImageBitmap:qt,Credential:Yt,CredentialsContainer:Yt,crypto:qt,Crypto:Yt,CryptoKey:Yt,CSS:Yt,CSSConditionRule:Yt,CSSFontFaceRule:Yt,CSSGroupingRule:Yt,CSSImportRule:Yt,CSSKeyframeRule:Yt,CSSKeyframesRule:Yt,CSSMediaRule:Yt,CSSNamespaceRule:Yt,CSSPageRule:Yt,CSSRule:Yt,CSSRuleList:Yt,CSSStyleDeclaration:Yt,CSSStyleRule:Yt,CSSStyleSheet:Yt,CSSSupportsRule:Yt,CustomElementRegistry:Yt,customElements:qt,CustomEvent:Yt,DataTransfer:Yt,DataTransferItem:Yt,DataTransferItemList:Yt,defaultstatus:qt,defaultStatus:qt,DelayNode:Yt,DeviceMotionEvent:Yt,DeviceOrientationEvent:Yt,devicePixelRatio:qt,dispatchEvent:qt,document:qt,Document:Yt,DocumentFragment:Yt,DocumentType:Yt,DOMError:Yt,DOMException:Yt,DOMImplementation:Yt,DOMMatrix:Yt,DOMMatrixReadOnly:Yt,DOMParser:Yt,DOMPoint:Yt,DOMPointReadOnly:Yt,DOMQuad:Yt,DOMRect:Yt,DOMRectReadOnly:Yt,DOMStringList:Yt,DOMStringMap:Yt,DOMTokenList:Yt,DragEvent:Yt,DynamicsCompressorNode:Yt,Element:Yt,ErrorEvent:Yt,Event:Yt,EventSource:Yt,EventTarget:Yt,external:qt,fetch:qt,File:Yt,FileList:Yt,FileReader:Yt,find:qt,focus:qt,FocusEvent:Yt,FontFace:Yt,FontFaceSetLoadEvent:Yt,FormData:Yt,frames:qt,GainNode:Yt,Gamepad:Yt,GamepadButton:Yt,GamepadEvent:Yt,getComputedStyle:qt,getSelection:qt,HashChangeEvent:Yt,Headers:Yt,history:qt,History:Yt,HTMLAllCollection:Yt,HTMLAnchorElement:Yt,HTMLAreaElement:Yt,HTMLAudioElement:Yt,HTMLBaseElement:Yt,HTMLBodyElement:Yt,HTMLBRElement:Yt,HTMLButtonElement:Yt,HTMLCanvasElement:Yt,HTMLCollection:Yt,HTMLContentElement:Yt,HTMLDataElement:Yt,HTMLDataListElement:Yt,HTMLDetailsElement:Yt,HTMLDialogElement:Yt,HTMLDirectoryElement:Yt,HTMLDivElement:Yt,HTMLDListElement:Yt,HTMLDocument:Yt,HTMLElement:Yt,HTMLEmbedElement:Yt,HTMLFieldSetElement:Yt,HTMLFontElement:Yt,HTMLFormControlsCollection:Yt,HTMLFormElement:Yt,HTMLFrameElement:Yt,HTMLFrameSetElement:Yt,HTMLHeadElement:Yt,HTMLHeadingElement:Yt,HTMLHRElement:Yt,HTMLHtmlElement:Yt,HTMLIFrameElement:Yt,HTMLImageElement:Yt,HTMLInputElement:Yt,HTMLLabelElement:Yt,HTMLLegendElement:Yt,HTMLLIElement:Yt,HTMLLinkElement:Yt,HTMLMapElement:Yt,HTMLMarqueeElement:Yt,HTMLMediaElement:Yt,HTMLMenuElement:Yt,HTMLMetaElement:Yt,HTMLMeterElement:Yt,HTMLModElement:Yt,HTMLObjectElement:Yt,HTMLOListElement:Yt,HTMLOptGroupElement:Yt,HTMLOptionElement:Yt,HTMLOptionsCollection:Yt,HTMLOutputElement:Yt,HTMLParagraphElement:Yt,HTMLParamElement:Yt,HTMLPictureElement:Yt,HTMLPreElement:Yt,HTMLProgressElement:Yt,HTMLQuoteElement:Yt,HTMLScriptElement:Yt,HTMLSelectElement:Yt,HTMLShadowElement:Yt,HTMLSlotElement:Yt,HTMLSourceElement:Yt,HTMLSpanElement:Yt,HTMLStyleElement:Yt,HTMLTableCaptionElement:Yt,HTMLTableCellElement:Yt,HTMLTableColElement:Yt,HTMLTableElement:Yt,HTMLTableRowElement:Yt,HTMLTableSectionElement:Yt,HTMLTemplateElement:Yt,HTMLTextAreaElement:Yt,HTMLTimeElement:Yt,HTMLTitleElement:Yt,HTMLTrackElement:Yt,HTMLUListElement:Yt,HTMLUnknownElement:Yt,HTMLVideoElement:Yt,IDBCursor:Yt,IDBCursorWithValue:Yt,IDBDatabase:Yt,IDBFactory:Yt,IDBIndex:Yt,IDBKeyRange:Yt,IDBObjectStore:Yt,IDBOpenDBRequest:Yt,IDBRequest:Yt,IDBTransaction:Yt,IDBVersionChangeEvent:Yt,IdleDeadline:Yt,IIRFilterNode:Yt,Image:Yt,ImageBitmap:Yt,ImageBitmapRenderingContext:Yt,ImageCapture:Yt,ImageData:Yt,indexedDB:qt,innerHeight:qt,innerWidth:qt,InputEvent:Yt,IntersectionObserver:Yt,IntersectionObserverEntry:Yt,isSecureContext:qt,KeyboardEvent:Yt,KeyframeEffect:Yt,length:qt,localStorage:qt,location:qt,Location:Yt,locationbar:qt,matchMedia:qt,MediaDeviceInfo:Yt,MediaDevices:Yt,MediaElementAudioSourceNode:Yt,MediaEncryptedEvent:Yt,MediaError:Yt,MediaKeyMessageEvent:Yt,MediaKeySession:Yt,MediaKeyStatusMap:Yt,MediaKeySystemAccess:Yt,MediaList:Yt,MediaQueryList:Yt,MediaQueryListEvent:Yt,MediaRecorder:Yt,MediaSettingsRange:Yt,MediaSource:Yt,MediaStream:Yt,MediaStreamAudioDestinationNode:Yt,MediaStreamAudioSourceNode:Yt,MediaStreamEvent:Yt,MediaStreamTrack:Yt,MediaStreamTrackEvent:Yt,menubar:qt,MessageChannel:Yt,MessageEvent:Yt,MessagePort:Yt,MIDIAccess:Yt,MIDIConnectionEvent:Yt,MIDIInput:Yt,MIDIInputMap:Yt,MIDIMessageEvent:Yt,MIDIOutput:Yt,MIDIOutputMap:Yt,MIDIPort:Yt,MimeType:Yt,MimeTypeArray:Yt,MouseEvent:Yt,moveBy:qt,moveTo:qt,MutationEvent:Yt,MutationObserver:Yt,MutationRecord:Yt,name:qt,NamedNodeMap:Yt,NavigationPreloadManager:Yt,navigator:qt,Navigator:Yt,NetworkInformation:Yt,Node:Yt,NodeFilter:qt,NodeIterator:Yt,NodeList:Yt,Notification:Yt,OfflineAudioCompletionEvent:Yt,OfflineAudioContext:Yt,offscreenBuffering:qt,OffscreenCanvas:Yt,open:qt,openDatabase:qt,Option:Yt,origin:qt,OscillatorNode:Yt,outerHeight:qt,outerWidth:qt,PageTransitionEvent:Yt,pageXOffset:qt,pageYOffset:qt,PannerNode:Yt,parent:qt,Path2D:Yt,PaymentAddress:Yt,PaymentRequest:Yt,PaymentRequestUpdateEvent:Yt,PaymentResponse:Yt,performance:qt,Performance:Yt,PerformanceEntry:Yt,PerformanceLongTaskTiming:Yt,PerformanceMark:Yt,PerformanceMeasure:Yt,PerformanceNavigation:Yt,PerformanceNavigationTiming:Yt,PerformanceObserver:Yt,PerformanceObserverEntryList:Yt,PerformancePaintTiming:Yt,PerformanceResourceTiming:Yt,PerformanceTiming:Yt,PeriodicWave:Yt,Permissions:Yt,PermissionStatus:Yt,personalbar:qt,PhotoCapabilities:Yt,Plugin:Yt,PluginArray:Yt,PointerEvent:Yt,PopStateEvent:Yt,postMessage:qt,Presentation:Yt,PresentationAvailability:Yt,PresentationConnection:Yt,PresentationConnectionAvailableEvent:Yt,PresentationConnectionCloseEvent:Yt,PresentationConnectionList:Yt,PresentationReceiver:Yt,PresentationRequest:Yt,print:qt,ProcessingInstruction:Yt,ProgressEvent:Yt,PromiseRejectionEvent:Yt,prompt:qt,PushManager:Yt,PushSubscription:Yt,PushSubscriptionOptions:Yt,queueMicrotask:qt,RadioNodeList:Yt,Range:Yt,ReadableStream:Yt,RemotePlayback:Yt,removeEventListener:qt,Request:Yt,requestAnimationFrame:qt,requestIdleCallback:qt,resizeBy:qt,ResizeObserver:Yt,ResizeObserverEntry:Yt,resizeTo:qt,Response:Yt,RTCCertificate:Yt,RTCDataChannel:Yt,RTCDataChannelEvent:Yt,RTCDtlsTransport:Yt,RTCIceCandidate:Yt,RTCIceTransport:Yt,RTCPeerConnection:Yt,RTCPeerConnectionIceEvent:Yt,RTCRtpReceiver:Yt,RTCRtpSender:Yt,RTCSctpTransport:Yt,RTCSessionDescription:Yt,RTCStatsReport:Yt,RTCTrackEvent:Yt,screen:qt,Screen:Yt,screenLeft:qt,ScreenOrientation:Yt,screenTop:qt,screenX:qt,screenY:qt,ScriptProcessorNode:Yt,scroll:qt,scrollbars:qt,scrollBy:qt,scrollTo:qt,scrollX:qt,scrollY:qt,SecurityPolicyViolationEvent:Yt,Selection:Yt,ServiceWorker:Yt,ServiceWorkerContainer:Yt,ServiceWorkerRegistration:Yt,sessionStorage:qt,ShadowRoot:Yt,SharedWorker:Yt,SourceBuffer:Yt,SourceBufferList:Yt,speechSynthesis:qt,SpeechSynthesisEvent:Yt,SpeechSynthesisUtterance:Yt,StaticRange:Yt,status:qt,statusbar:qt,StereoPannerNode:Yt,stop:qt,Storage:Yt,StorageEvent:Yt,StorageManager:Yt,styleMedia:qt,StyleSheet:Yt,StyleSheetList:Yt,SubtleCrypto:Yt,SVGAElement:Yt,SVGAngle:Yt,SVGAnimatedAngle:Yt,SVGAnimatedBoolean:Yt,SVGAnimatedEnumeration:Yt,SVGAnimatedInteger:Yt,SVGAnimatedLength:Yt,SVGAnimatedLengthList:Yt,SVGAnimatedNumber:Yt,SVGAnimatedNumberList:Yt,SVGAnimatedPreserveAspectRatio:Yt,SVGAnimatedRect:Yt,SVGAnimatedString:Yt,SVGAnimatedTransformList:Yt,SVGAnimateElement:Yt,SVGAnimateMotionElement:Yt,SVGAnimateTransformElement:Yt,SVGAnimationElement:Yt,SVGCircleElement:Yt,SVGClipPathElement:Yt,SVGComponentTransferFunctionElement:Yt,SVGDefsElement:Yt,SVGDescElement:Yt,SVGDiscardElement:Yt,SVGElement:Yt,SVGEllipseElement:Yt,SVGFEBlendElement:Yt,SVGFEColorMatrixElement:Yt,SVGFEComponentTransferElement:Yt,SVGFECompositeElement:Yt,SVGFEConvolveMatrixElement:Yt,SVGFEDiffuseLightingElement:Yt,SVGFEDisplacementMapElement:Yt,SVGFEDistantLightElement:Yt,SVGFEDropShadowElement:Yt,SVGFEFloodElement:Yt,SVGFEFuncAElement:Yt,SVGFEFuncBElement:Yt,SVGFEFuncGElement:Yt,SVGFEFuncRElement:Yt,SVGFEGaussianBlurElement:Yt,SVGFEImageElement:Yt,SVGFEMergeElement:Yt,SVGFEMergeNodeElement:Yt,SVGFEMorphologyElement:Yt,SVGFEOffsetElement:Yt,SVGFEPointLightElement:Yt,SVGFESpecularLightingElement:Yt,SVGFESpotLightElement:Yt,SVGFETileElement:Yt,SVGFETurbulenceElement:Yt,SVGFilterElement:Yt,SVGForeignObjectElement:Yt,SVGGElement:Yt,SVGGeometryElement:Yt,SVGGradientElement:Yt,SVGGraphicsElement:Yt,SVGImageElement:Yt,SVGLength:Yt,SVGLengthList:Yt,SVGLinearGradientElement:Yt,SVGLineElement:Yt,SVGMarkerElement:Yt,SVGMaskElement:Yt,SVGMatrix:Yt,SVGMetadataElement:Yt,SVGMPathElement:Yt,SVGNumber:Yt,SVGNumberList:Yt,SVGPathElement:Yt,SVGPatternElement:Yt,SVGPoint:Yt,SVGPointList:Yt,SVGPolygonElement:Yt,SVGPolylineElement:Yt,SVGPreserveAspectRatio:Yt,SVGRadialGradientElement:Yt,SVGRect:Yt,SVGRectElement:Yt,SVGScriptElement:Yt,SVGSetElement:Yt,SVGStopElement:Yt,SVGStringList:Yt,SVGStyleElement:Yt,SVGSVGElement:Yt,SVGSwitchElement:Yt,SVGSymbolElement:Yt,SVGTextContentElement:Yt,SVGTextElement:Yt,SVGTextPathElement:Yt,SVGTextPositioningElement:Yt,SVGTitleElement:Yt,SVGTransform:Yt,SVGTransformList:Yt,SVGTSpanElement:Yt,SVGUnitTypes:Yt,SVGUseElement:Yt,SVGViewElement:Yt,TaskAttributionTiming:Yt,Text:Yt,TextEvent:Yt,TextMetrics:Yt,TextTrack:Yt,TextTrackCue:Yt,TextTrackCueList:Yt,TextTrackList:Yt,TimeRanges:Yt,toolbar:qt,top:qt,Touch:Yt,TouchEvent:Yt,TouchList:Yt,TrackEvent:Yt,TransitionEvent:Yt,TreeWalker:Yt,UIEvent:Yt,ValidityState:Yt,visualViewport:qt,VisualViewport:Yt,VTTCue:Yt,WaveShaperNode:Yt,WebAssembly:qt,WebGL2RenderingContext:Yt,WebGLActiveInfo:Yt,WebGLBuffer:Yt,WebGLContextEvent:Yt,WebGLFramebuffer:Yt,WebGLProgram:Yt,WebGLQuery:Yt,WebGLRenderbuffer:Yt,WebGLRenderingContext:Yt,WebGLSampler:Yt,WebGLShader:Yt,WebGLShaderPrecisionFormat:Yt,WebGLSync:Yt,WebGLTexture:Yt,WebGLTransformFeedback:Yt,WebGLUniformLocation:Yt,WebGLVertexArrayObject:Yt,WebSocket:Yt,WheelEvent:Yt,Window:Yt,Worker:Yt,WritableStream:Yt,XMLDocument:Yt,XMLHttpRequest:Yt,XMLHttpRequestEventTarget:Yt,XMLHttpRequestUpload:Yt,XMLSerializer:Yt,XPathEvaluator:Yt,XPathExpression:Yt,XPathResult:Yt,XSLTProcessor:Yt};for(const e of ["window","global","self","globalThis"])ei[e]=ei;function ti(e){let t=ei;for(const i of e){if("string"!=typeof i)return null;if(t=t[i],!t)return null}return t[Gt]}class ii extends ee{constructor(){super(...arguments),this.isReassigned=!0;}getLiteralValueAtPath(e,t,i){return ti([this.name,...e])?q:W}hasEffectsOnInteractionAtPath(e,t,i){switch(t.type){case 0:return 0===e.length?"undefined"!==this.name&&!ti([this.name]):!ti([this.name,...e].slice(0,-1));case 1:return !0;case 2:{const s=ti([this.name,...e]);return !s||s.hasEffectsWhenCalled(t,i)}}}}const si={__proto__:null,class:!0,const:!0,let:!0,var:!0};class ni extends ut{constructor(){super(...arguments),this.variable=null,this.isTDZAccess=null;}addExportedVariables(e,t){t.has(this.variable)&&e.push(this.variable);}bind(){!this.variable&&Ut(this,this.parent)&&(this.variable=this.scope.findVariable(this.name),this.variable.addReference(this));}declare(e,t){let i;const{treeshake:s}=this.context.options;switch(e){case"var":i=this.scope.addDeclaration(this,this.context,t,!0),s&&s.correctVarValueBeforeDeclaration&&i.markInitializersForDeoptimization();break;case"function":case"let":case"const":case"class":i=this.scope.addDeclaration(this,this.context,t,!1);break;case"parameter":i=this.scope.addParameterDeclaration(this);break;default:throw new Error(`Internal Error: Unexpected identifier kind ${e}.`)}return i.kind=e,[this.variable=i]}deoptimizePath(e){var t;0!==e.length||this.scope.contains(this.name)||this.disallowImportReassignment(),null===(t=this.variable)||void 0===t||t.deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){this.variable.deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){return this.getVariableRespectingTDZ().getLiteralValueAtPath(e,t,i)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.getVariableRespectingTDZ().getReturnExpressionWhenCalledAtPath(e,t,i,s)}hasEffects(e){return this.deoptimized||this.applyDeoptimizations(),!(!this.isPossibleTDZ()||"var"===this.variable.kind)||this.context.options.treeshake.unknownGlobalSideEffects&&this.variable instanceof ii&&this.variable.hasEffectsOnInteractionAtPath(V,Y,e)}hasEffectsOnInteractionAtPath(e,t,i){switch(t.type){case 0:return null!==this.variable&&this.getVariableRespectingTDZ().hasEffectsOnInteractionAtPath(e,t,i);case 1:return (e.length>0?this.getVariableRespectingTDZ():this.variable).hasEffectsOnInteractionAtPath(e,t,i);case 2:return this.getVariableRespectingTDZ().hasEffectsOnInteractionAtPath(e,t,i)}}include(){this.deoptimized||this.applyDeoptimizations(),this.included||(this.included=!0,null!==this.variable&&this.context.includeVariableInModule(this.variable));}includeCallArguments(e,t){this.variable.includeCallArguments(e,t);}isPossibleTDZ(){if(null!==this.isTDZAccess)return this.isTDZAccess;if(!(this.variable instanceof Dt&&this.variable.kind&&this.variable.kind in si))return this.isTDZAccess=!1;let e;return this.variable.declarations&&1===this.variable.declarations.length&&(e=this.variable.declarations[0])&&this.start<e.start&&ri(this)===ri(e)?this.isTDZAccess=!0:this.variable.initReached?this.isTDZAccess=!1:this.isTDZAccess=!0}markDeclarationReached(){this.variable.initReached=!0;}render(e,{snippets:{getPropertyAccess:t}},{renderedParentType:i,isCalleeOfRenderedParent:s,isShorthandProperty:n}=ie){if(this.variable){const r=this.variable.getName(t);r!==this.name&&(e.overwrite(this.start,this.end,r,{contentOnly:!0,storeName:!0}),n&&e.prependRight(this.start,`${this.name}: `)),"eval"===r&&"CallExpression"===i&&s&&e.appendRight(this.start,"0, ");}}applyDeoptimizations(){this.deoptimized=!0,this.variable instanceof Dt&&(this.variable.consolidateInitializers(),this.context.requestTreeshakingPass());}disallowImportReassignment(){return this.context.error({code:"ILLEGAL_REASSIGNMENT",message:`Illegal reassignment to import '${this.name}'`},this.start)}getVariableRespectingTDZ(){return this.isPossibleTDZ()?X:this.variable}}function ri(e){for(;e&&!/^Program|Function/.test(e.type);)e=e.parent;return e}function ai(e,t,i,s){if(t.remove(i,s),e.annotations)for(const s of e.annotations){if(!(s.start<i))return;t.remove(s.start,s.end);}}function oi(e,t){if(e.annotations||"ExpressionStatement"!==e.parent.type||(e=e.parent),e.annotations)for(const i of e.annotations)t.remove(i.start,i.end);}const li={isNoStatement:!0};function hi(e,t,i=0){let s,n;for(s=e.indexOf(t,i);;){if(-1===(i=e.indexOf("/",i))||i>=s)return s;n=e.charCodeAt(++i),++i,(i=47===n?e.indexOf("\n",i)+1:e.indexOf("*/",i)+2)>s&&(s=e.indexOf(t,i));}}const ci=/\S/g;function ui(e,t){ci.lastIndex=t;return ci.exec(e).index}function di(e){let t,i,s=0;for(t=e.indexOf("\n",s);;){if(s=e.indexOf("/",s),-1===s||s>t)return [t,t+1];if(i=e.charCodeAt(s+1),47===i)return [s,t+1];s=e.indexOf("*/",s+3)+2,s>t&&(t=e.indexOf("\n",s));}}function pi(e,t,i,s,n){let r,a,o,l,h=e[0],c=!h.included||h.needsBoundaries;c&&(l=i+di(t.original.slice(i,h.start))[1]);for(let i=1;i<=e.length;i++)r=h,a=l,o=c,h=e[i],c=void 0!==h&&(!h.included||h.needsBoundaries),o||c?(l=r.end+di(t.original.slice(r.end,void 0===h?s:h.start))[1],r.included?o?r.render(t,n,{end:l,start:a}):r.render(t,n):ai(r,t,a,l)):r.render(t,n);}function fi(e,t,i,s){const n=[];let r,a,o,l,h,c=i-1;for(let s=0;s<e.length;s++){for(a=e[s],void 0!==r&&(c=r.end+hi(t.original.slice(r.end,a.start),",")),o=l=c+1+di(t.original.slice(c+1,a.start))[1];h=t.original.charCodeAt(o),32===h||9===h||10===h||13===h;)o++;void 0!==r&&n.push({contentEnd:l,end:o,node:r,separator:c,start:i}),r=a,i=o;}return n.push({contentEnd:s,end:s,node:r,separator:null,start:i}),n}function mi(e,t,i){for(;;){const[s,n]=di(e.original.slice(t,i));if(-1===s)break;e.remove(t+s,t+=n);}}class gi extends Ft{addDeclaration(e,t,i,s){if(s){const n=this.parent.addDeclaration(e,t,i,s);return n.markInitializersForDeoptimization(),n}return super.addDeclaration(e,t,i,!1)}}class yi extends ut{initialise(){this.directive&&"use strict"!==this.directive&&"Program"===this.parent.type&&this.context.warn({code:"MODULE_LEVEL_DIRECTIVE",message:`Module level directives cause errors when bundled, '${this.directive}' was ignored.`},this.start);}render(e,t){super.render(e,t),this.included&&this.insertSemicolon(e);}shouldBeIncluded(e){return this.directive&&"use strict"!==this.directive?"Program"!==this.parent.type:super.shouldBeIncluded(e)}applyDeoptimizations(){}}class xi extends ut{constructor(){super(...arguments),this.directlyIncluded=!1;}addImplicitReturnExpressionToScope(){const e=this.body[this.body.length-1];e&&"ReturnStatement"===e.type||this.scope.addReturnExpression(X);}createScope(e){this.scope=this.parent.preventChildBlockScope?e:new gi(e);}hasEffects(e){if(this.deoptimizeBody)return !0;for(const t of this.body){if(e.brokenFlow)break;if(t.hasEffects(e))return !0}return !1}include(e,t){if(!this.deoptimizeBody||!this.directlyIncluded){this.included=!0,this.directlyIncluded=!0,this.deoptimizeBody&&(t=!0);for(const i of this.body)(t||i.shouldBeIncluded(e))&&i.include(e,t);}}initialise(){const e=this.body[0];this.deoptimizeBody=e instanceof yi&&"use asm"===e.directive;}render(e,t){this.body.length?pi(this.body,e,this.start+1,this.end-1,t):super.render(e,t);}}class Ei extends ut{constructor(){super(...arguments),this.declarationInit=null;}addExportedVariables(e,t){this.argument.addExportedVariables(e,t);}declare(e,t){return this.declarationInit=t,this.argument.declare(e,X)}deoptimizePath(e){0===e.length&&this.argument.deoptimizePath(V);}hasEffectsOnInteractionAtPath(e,t,i){return e.length>0||this.argument.hasEffectsOnInteractionAtPath(V,t,i)}markDeclarationReached(){this.argument.markDeclarationReached();}applyDeoptimizations(){this.deoptimized=!0,null!==this.declarationInit&&(this.declarationInit.deoptimizePath([M,M]),this.context.requestTreeshakingPass());}}class bi extends ut{constructor(){super(...arguments),this.objectEntity=null,this.deoptimizedReturn=!1;}deoptimizePath(e){this.getObjectEntity().deoptimizePath(e),1===e.length&&e[0]===M&&this.scope.getReturnExpression().deoptimizePath(B);}deoptimizeThisOnInteractionAtPath(e,t,i){t.length>0&&this.getObjectEntity().deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){return this.getObjectEntity().getLiteralValueAtPath(e,t,i)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return e.length>0?this.getObjectEntity().getReturnExpressionWhenCalledAtPath(e,t,i,s):this.async?(this.deoptimizedReturn||(this.deoptimizedReturn=!0,this.scope.getReturnExpression().deoptimizePath(B),this.context.requestTreeshakingPass()),X):this.scope.getReturnExpression()}hasEffectsOnInteractionAtPath(e,t,i){if(e.length>0||2!==t.type)return this.getObjectEntity().hasEffectsOnInteractionAtPath(e,t,i);if(this.async){const{propertyReadSideEffects:e}=this.context.options.treeshake,t=this.scope.getReturnExpression();if(t.hasEffectsOnInteractionAtPath(["then"],J,i)||e&&("always"===e||t.hasEffectsOnInteractionAtPath(["then"],Y,i)))return !0}for(const e of this.params)if(e.hasEffects(i))return !0;return !1}include(e,t){this.deoptimized||this.applyDeoptimizations(),this.included=!0;const{brokenFlow:i}=e;e.brokenFlow=0,this.body.include(e,t),e.brokenFlow=i;}includeCallArguments(e,t){this.scope.includeCallArguments(e,t);}initialise(){this.scope.addParameterVariables(this.params.map((e=>e.declare("parameter",X))),this.params[this.params.length-1]instanceof Ei),this.body instanceof xi?this.body.addImplicitReturnExpressionToScope():this.scope.addReturnExpression(this.body);}parseNode(e){"BlockStatement"===e.body.type&&(this.body=new xi(e.body,this,this.scope.hoistedBodyVarScope)),super.parseNode(e);}applyDeoptimizations(){}}bi.prototype.preventChildBlockScope=!0;class vi extends bi{constructor(){super(...arguments),this.objectEntity=null;}createScope(e){this.scope=new jt(e,this.context);}hasEffects(){return this.deoptimized||this.applyDeoptimizations(),!1}hasEffectsOnInteractionAtPath(e,t,i){if(super.hasEffectsOnInteractionAtPath(e,t,i))return !0;if(2===t.type){const{ignore:e,brokenFlow:t}=i;if(i.ignore={breaks:!1,continues:!1,labels:new Set,returnYield:!0},this.body.hasEffects(i))return !0;i.ignore=e,i.brokenFlow=t;}return !1}include(e,t){super.include(e,t);for(const i of this.params)i instanceof ni||i.include(e,t);}getObjectEntity(){return null!==this.objectEntity?this.objectEntity:this.objectEntity=new Et([],St)}}function Si(e,{exportNamesByVariable:t,snippets:{_:i,getObject:s,getPropertyAccess:n}},r=""){if(1===e.length&&1===t.get(e[0]).length){const s=e[0];return `exports('${t.get(s)}',${i}${s.getName(n)}${r})`}{const i=[];for(const s of e)for(const e of t.get(s))i.push([e,s.getName(n)+r]);return `exports(${s(i,{lineBreakIndent:null})})`}}function Ai(e,t,i,s,{exportNamesByVariable:n,snippets:{_:r}}){s.prependRight(t,`exports('${n.get(e)}',${r}`),s.appendLeft(i,")");}function Ii(e,t,i,s,n,r){const{_:a,getPropertyAccess:o}=r.snippets;n.appendLeft(i,`,${a}${Si([e],r)},${a}${e.getName(o)}`),s&&(n.prependRight(t,"("),n.appendLeft(i,")"));}class ki extends ut{addExportedVariables(e,t){for(const i of this.properties)"Property"===i.type?i.value.addExportedVariables(e,t):i.argument.addExportedVariables(e,t);}declare(e,t){const i=[];for(const s of this.properties)i.push(...s.declare(e,t));return i}deoptimizePath(e){if(0===e.length)for(const t of this.properties)t.deoptimizePath(e);}hasEffectsOnInteractionAtPath(e,t,i){for(const e of this.properties)if(e.hasEffectsOnInteractionAtPath(V,t,i))return !0;return !1}markDeclarationReached(){for(const e of this.properties)e.markDeclarationReached();}}class Pi extends Dt{constructor(e){super("arguments",null,X,e);}hasEffectsOnInteractionAtPath(e,{type:t}){return 0!==t||e.length>1}}class wi extends Dt{constructor(e){super("this",null,null,e),this.deoptimizedPaths=[],this.entitiesToBeDeoptimized=new Set,this.thisDeoptimizationList=[],this.thisDeoptimizations=new H;}addEntityToBeDeoptimized(e){for(const t of this.deoptimizedPaths)e.deoptimizePath(t);for(const{interaction:t,path:i}of this.thisDeoptimizationList)e.deoptimizeThisOnInteractionAtPath(t,i,G);this.entitiesToBeDeoptimized.add(e);}deoptimizePath(e){if(0!==e.length&&!this.deoptimizationTracker.trackEntityAtPathAndGetIfTracked(e,this)){this.deoptimizedPaths.push(e);for(const t of this.entitiesToBeDeoptimized)t.deoptimizePath(e);}}deoptimizeThisOnInteractionAtPath(e,t){const i={interaction:e,path:t};if(!this.thisDeoptimizations.trackEntityAtPathAndGetIfTracked(t,e.type,e.thisArg)){for(const i of this.entitiesToBeDeoptimized)i.deoptimizeThisOnInteractionAtPath(e,t,G);this.thisDeoptimizationList.push(i);}}hasEffectsOnInteractionAtPath(e,t,i){return this.getInit(i).hasEffectsOnInteractionAtPath(e,t,i)||super.hasEffectsOnInteractionAtPath(e,t,i)}getInit(e){return e.replacedVariableInits.get(this)||X}}class Ci extends jt{constructor(e,t){super(e,t),this.variables.set("arguments",this.argumentsVariable=new Pi(t)),this.variables.set("this",this.thisVariable=new wi(t));}findLexicalBoundary(){return this}includeCallArguments(e,t){if(super.includeCallArguments(e,t),this.argumentsVariable.included)for(const i of t)i.included||i.include(e,!1);}}class _i extends bi{constructor(){super(...arguments),this.objectEntity=null;}createScope(e){this.scope=new Ci(e,this.context);}deoptimizeThisOnInteractionAtPath(e,t,i){super.deoptimizeThisOnInteractionAtPath(e,t,i),2===e.type&&0===t.length&&this.scope.thisVariable.addEntityToBeDeoptimized(e.thisArg);}hasEffects(e){var t;return this.deoptimized||this.applyDeoptimizations(),!!(null===(t=this.id)||void 0===t?void 0:t.hasEffects(e))}hasEffectsOnInteractionAtPath(e,t,i){if(super.hasEffectsOnInteractionAtPath(e,t,i))return !0;if(2===t.type){const e=i.replacedVariableInits.get(this.scope.thisVariable);i.replacedVariableInits.set(this.scope.thisVariable,t.withNew?new Et(Object.create(null),St):X);const{brokenFlow:s,ignore:n}=i;if(i.ignore={breaks:!1,continues:!1,labels:new Set,returnYield:!0},this.body.hasEffects(i))return !0;i.brokenFlow=s,e?i.replacedVariableInits.set(this.scope.thisVariable,e):i.replacedVariableInits.delete(this.scope.thisVariable),i.ignore=n;}return !1}include(e,t){var i;super.include(e,t),null===(i=this.id)||void 0===i||i.include();const s=this.scope.argumentsVariable.included;for(const i of this.params)i instanceof ni&&!s||i.include(e,t);}initialise(){var e;super.initialise(),null===(e=this.id)||void 0===e||e.declare("function",this);}getObjectEntity(){return null!==this.objectEntity?this.objectEntity:this.objectEntity=new Et([{key:"prototype",kind:"init",property:new Et([],St)}],St)}}const Ni={"!=":(e,t)=>e!=t,"!==":(e,t)=>e!==t,"%":(e,t)=>e%t,"&":(e,t)=>e&t,"*":(e,t)=>e*t,"**":(e,t)=>e**t,"+":(e,t)=>e+t,"-":(e,t)=>e-t,"/":(e,t)=>e/t,"<":(e,t)=>e<t,"<<":(e,t)=>e<<t,"<=":(e,t)=>e<=t,"==":(e,t)=>e==t,"===":(e,t)=>e===t,">":(e,t)=>e>t,">=":(e,t)=>e>=t,">>":(e,t)=>e>>t,">>>":(e,t)=>e>>>t,"^":(e,t)=>e^t,"|":(e,t)=>e|t};function $i(e,t,i){if(i.arguments.length>0)if(i.arguments[i.arguments.length-1].included)for(const s of i.arguments)s.render(e,t);else {let s=i.arguments.length-2;for(;s>=0&&!i.arguments[s].included;)s--;if(s>=0){for(let n=0;n<=s;n++)i.arguments[n].render(e,t);e.remove(hi(e.original,",",i.arguments[s].end),i.end-1);}else e.remove(hi(e.original,"(",i.callee.end)+1,i.end-1);}}class Ti extends ut{deoptimizeThisOnInteractionAtPath(){}getLiteralValueAtPath(e){return e.length>0||null===this.value&&110!==this.context.code.charCodeAt(this.start)||"bigint"==typeof this.value||47===this.context.code.charCodeAt(this.start)?W:this.value}getReturnExpressionWhenCalledAtPath(e){return 1!==e.length?X:Qe(this.members,e[0])}hasEffectsOnInteractionAtPath(e,t,i){switch(t.type){case 0:return e.length>(null===this.value?0:1);case 1:return !0;case 2:return 1!==e.length||Ye(this.members,e[0],t,i)}}initialise(){this.members=function(e){switch(typeof e){case"boolean":return qe;case"number":return Ke;case"string":return Xe}return Object.create(null)}(this.value);}parseNode(e){this.value=e.value,this.regex=e.regex,super.parseNode(e);}render(e){"string"==typeof this.value&&e.indentExclusionRanges.push([this.start+1,this.end-1]);}}function Oi(e){return e.computed?function(e){if(e instanceof Ti)return String(e.value);return null}(e.property):e.property.name}function Ri(e){const t=e.propertyKey,i=e.object;if("string"==typeof t){if(i instanceof ni)return [{key:i.name,pos:i.start},{key:t,pos:e.property.start}];if(i instanceof Mi){const s=Ri(i);return s&&[...s,{key:t,pos:e.property.start}]}}return null}class Mi extends ut{constructor(){super(...arguments),this.variable=null,this.assignmentDeoptimized=!1,this.bound=!1,this.expressionsToBeDeoptimized=[],this.replacement=null;}bind(){this.bound=!0;const e=Ri(this),t=e&&this.scope.findVariable(e[0].key);if(t&&t.isNamespace){const i=Di(t,e.slice(1),this.context);i?"string"==typeof i?this.replacement=i:(this.variable=i,this.scope.addNamespaceMemberAccess(function(e){let t=e[0].key;for(let i=1;i<e.length;i++)t+="."+e[i].key;return t}(e),i)):super.bind();}else super.bind();}deoptimizeCache(){const e=this.expressionsToBeDeoptimized;this.expressionsToBeDeoptimized=[],this.propertyKey=M,this.object.deoptimizePath(B);for(const t of e)t.deoptimizeCache();}deoptimizePath(e){if(0===e.length&&this.disallowNamespaceReassignment(),this.variable)this.variable.deoptimizePath(e);else if(!this.replacement&&e.length<7){const t=this.getPropertyKey();this.object.deoptimizePath([t===M?D:t,...e]);}}deoptimizeThisOnInteractionAtPath(e,t,i){this.variable?this.variable.deoptimizeThisOnInteractionAtPath(e,t,i):this.replacement||(t.length<7?this.object.deoptimizeThisOnInteractionAtPath(e,[this.getPropertyKey(),...t],i):e.thisArg.deoptimizePath(B));}getLiteralValueAtPath(e,t,i){return this.variable?this.variable.getLiteralValueAtPath(e,t,i):this.replacement?W:(this.expressionsToBeDeoptimized.push(i),e.length<7?this.object.getLiteralValueAtPath([this.getPropertyKey(),...e],t,i):W)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.variable?this.variable.getReturnExpressionWhenCalledAtPath(e,t,i,s):this.replacement?X:(this.expressionsToBeDeoptimized.push(s),e.length<7?this.object.getReturnExpressionWhenCalledAtPath([this.getPropertyKey(),...e],t,i,s):X)}hasEffects(e){return this.deoptimized||this.applyDeoptimizations(),this.property.hasEffects(e)||this.object.hasEffects(e)||this.hasAccessEffect(e)}hasEffectsAsAssignmentTarget(e,t){return t&&!this.deoptimized&&this.applyDeoptimizations(),this.assignmentDeoptimized||this.applyAssignmentDeoptimization(),this.property.hasEffects(e)||this.object.hasEffects(e)||t&&this.hasAccessEffect(e)||this.hasEffectsOnInteractionAtPath(V,this.assignmentInteraction,e)}hasEffectsOnInteractionAtPath(e,t,i){return this.variable?this.variable.hasEffectsOnInteractionAtPath(e,t,i):!!this.replacement||(!(e.length<7)||this.object.hasEffectsOnInteractionAtPath([this.getPropertyKey(),...e],t,i))}include(e,t){this.deoptimized||this.applyDeoptimizations(),this.includeProperties(e,t);}includeAsAssignmentTarget(e,t,i){this.assignmentDeoptimized||this.applyAssignmentDeoptimization(),i?this.include(e,t):this.includeProperties(e,t);}includeCallArguments(e,t){this.variable?this.variable.includeCallArguments(e,t):super.includeCallArguments(e,t);}initialise(){this.propertyKey=Oi(this),this.accessInteraction={thisArg:this.object,type:0};}render(e,t,{renderedParentType:i,isCalleeOfRenderedParent:s,renderedSurroundingElement:n}=ie){if(this.variable||this.replacement){const{snippets:{getPropertyAccess:n}}=t;let r=this.variable?this.variable.getName(n):this.replacement;i&&s&&(r="0, "+r),e.overwrite(this.start,this.end,r,{contentOnly:!0,storeName:!0});}else i&&s&&e.appendRight(this.start,"0, "),this.object.render(e,t,{renderedSurroundingElement:n}),this.property.render(e,t);}setAssignedValue(e){this.assignmentInteraction={args:[e],thisArg:this.object,type:1};}applyDeoptimizations(){this.deoptimized=!0;const{propertyReadSideEffects:e}=this.context.options.treeshake;if(this.bound&&e&&!this.variable&&!this.replacement){const e=this.getPropertyKey();this.object.deoptimizeThisOnInteractionAtPath(this.accessInteraction,[e],G),this.context.requestTreeshakingPass();}}applyAssignmentDeoptimization(){this.assignmentDeoptimized=!0;const{propertyReadSideEffects:e}=this.context.options.treeshake;this.bound&&e&&!this.variable&&!this.replacement&&(this.object.deoptimizeThisOnInteractionAtPath(this.assignmentInteraction,[this.getPropertyKey()],G),this.context.requestTreeshakingPass());}disallowNamespaceReassignment(){if(this.object instanceof ni){this.scope.findVariable(this.object.name).isNamespace&&(this.variable&&this.context.includeVariableInModule(this.variable),this.context.warn({code:"ILLEGAL_NAMESPACE_REASSIGNMENT",message:`Illegal reassignment to import '${this.object.name}'`},this.start));}}getPropertyKey(){if(null===this.propertyKey){this.propertyKey=M;const e=this.property.getLiteralValueAtPath(V,G,this);return this.propertyKey="symbol"==typeof e?M:String(e)}return this.propertyKey}hasAccessEffect(e){const{propertyReadSideEffects:t}=this.context.options.treeshake;return !(this.variable||this.replacement)&&t&&("always"===t||this.object.hasEffectsOnInteractionAtPath([this.getPropertyKey()],this.accessInteraction,e))}includeProperties(e,t){this.included||(this.included=!0,this.variable&&this.context.includeVariableInModule(this.variable)),this.object.include(e,t),this.property.include(e,t);}}function Di(e,t,i){if(0===t.length)return e;if(!e.isNamespace||e instanceof te)return null;const s=t[0].key,n=e.context.traceExport(s);if(!n){const n=e.context.fileName;return i.warn({code:"MISSING_EXPORT",exporter:he(n),importer:he(i.fileName),message:`'${s}' is not exported by '${he(n)}'`,missing:s,url:"https://rollupjs.org/guide/en/#error-name-is-not-exported-by-module"},t[0].pos),"undefined"}return Di(n,t.slice(1),i)}class Li extends ut{constructor(){super(...arguments),this.returnExpression=null,this.deoptimizableDependentExpressions=[],this.expressionsToBeDeoptimized=new Set;}deoptimizeCache(){if(this.returnExpression!==X){this.returnExpression=X;for(const e of this.deoptimizableDependentExpressions)e.deoptimizeCache();for(const e of this.expressionsToBeDeoptimized)e.deoptimizePath(B);}}deoptimizePath(e){if(0===e.length||this.context.deoptimizationTracker.trackEntityAtPathAndGetIfTracked(e,this))return;const t=this.getReturnExpression();t!==X&&t.deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){const s=this.getReturnExpression(i);s===X?e.thisArg.deoptimizePath(B):i.withTrackedEntityAtPath(t,s,(()=>{this.expressionsToBeDeoptimized.add(e.thisArg),s.deoptimizeThisOnInteractionAtPath(e,t,i);}),void 0);}getLiteralValueAtPath(e,t,i){const s=this.getReturnExpression(t);return s===X?W:t.withTrackedEntityAtPath(e,s,(()=>(this.deoptimizableDependentExpressions.push(i),s.getLiteralValueAtPath(e,t,i))),W)}getReturnExpressionWhenCalledAtPath(e,t,i,s){const n=this.getReturnExpression(i);return this.returnExpression===X?X:i.withTrackedEntityAtPath(e,n,(()=>(this.deoptimizableDependentExpressions.push(s),n.getReturnExpressionWhenCalledAtPath(e,t,i,s))),X)}hasEffectsOnInteractionAtPath(e,t,i){const{type:s}=t;if(2===s){if((t.withNew?i.instantiated:i.called).trackEntityAtPathAndGetIfTracked(e,t.args,this))return !1}else if((1===s?i.assigned:i.accessed).trackEntityAtPathAndGetIfTracked(e,this))return !1;return this.getReturnExpression().hasEffectsOnInteractionAtPath(e,t,i)}}class Vi extends zt{addDeclaration(e,t,i,s){const n=this.variables.get(e.name);return n?(this.parent.addDeclaration(e,t,Le,s),n.addDeclaration(e,i),n):this.parent.addDeclaration(e,t,i,s)}}class Bi extends Ft{constructor(e,t,i){super(e),this.variables.set("this",this.thisVariable=new Dt("this",null,t,i)),this.instanceScope=new Ft(this),this.instanceScope.variables.set("this",new wi(i));}findLexicalBoundary(){return this}}class Fi extends ut{constructor(){super(...arguments),this.accessedValue=null;}deoptimizeCache(){}deoptimizePath(e){this.getAccessedValue().deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){return 0===e.type&&"get"===this.kind&&0===t.length?this.value.deoptimizeThisOnInteractionAtPath({args:Z,thisArg:e.thisArg,type:2,withNew:!1},V,i):1===e.type&&"set"===this.kind&&0===t.length?this.value.deoptimizeThisOnInteractionAtPath({args:e.args,thisArg:e.thisArg,type:2,withNew:!1},V,i):void this.getAccessedValue().deoptimizeThisOnInteractionAtPath(e,t,i)}getLiteralValueAtPath(e,t,i){return this.getAccessedValue().getLiteralValueAtPath(e,t,i)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.getAccessedValue().getReturnExpressionWhenCalledAtPath(e,t,i,s)}hasEffects(e){return this.key.hasEffects(e)}hasEffectsOnInteractionAtPath(e,t,i){return "get"===this.kind&&0===t.type&&0===e.length?this.value.hasEffectsOnInteractionAtPath(V,{args:Z,thisArg:t.thisArg,type:2,withNew:!1},i):"set"===this.kind&&1===t.type?this.value.hasEffectsOnInteractionAtPath(V,{args:t.args,thisArg:t.thisArg,type:2,withNew:!1},i):this.getAccessedValue().hasEffectsOnInteractionAtPath(e,t,i)}applyDeoptimizations(){}getAccessedValue(){return null===this.accessedValue?"get"===this.kind?(this.accessedValue=X,this.accessedValue=this.value.getReturnExpressionWhenCalledAtPath(V,J,G,this)):this.accessedValue=this.value:this.accessedValue}}class zi extends Fi{applyDeoptimizations(){}}class ji extends K{constructor(e,t){super(),this.object=e,this.key=t;}deoptimizePath(e){this.object.deoptimizePath([this.key,...e]);}deoptimizeThisOnInteractionAtPath(e,t,i){this.object.deoptimizeThisOnInteractionAtPath(e,[this.key,...t],i);}getLiteralValueAtPath(e,t,i){return this.object.getLiteralValueAtPath([this.key,...e],t,i)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.object.getReturnExpressionWhenCalledAtPath([this.key,...e],t,i,s)}hasEffectsOnInteractionAtPath(e,t,i){return this.object.hasEffectsOnInteractionAtPath([this.key,...e],t,i)}}class Ui extends ut{constructor(){super(...arguments),this.objectEntity=null;}createScope(e){this.scope=new Ft(e);}deoptimizeCache(){this.getObjectEntity().deoptimizeAllProperties();}deoptimizePath(e){this.getObjectEntity().deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){this.getObjectEntity().deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){return this.getObjectEntity().getLiteralValueAtPath(e,t,i)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.getObjectEntity().getReturnExpressionWhenCalledAtPath(e,t,i,s)}hasEffects(e){var t,i;this.deoptimized||this.applyDeoptimizations();const s=(null===(t=this.superClass)||void 0===t?void 0:t.hasEffects(e))||this.body.hasEffects(e);return null===(i=this.id)||void 0===i||i.markDeclarationReached(),s||super.hasEffects(e)}hasEffectsOnInteractionAtPath(e,t,i){var s;return 2===t.type&&0===e.length?!t.withNew||(null!==this.classConstructor?this.classConstructor.hasEffectsOnInteractionAtPath(e,t,i):null===(s=this.superClass)||void 0===s?void 0:s.hasEffectsOnInteractionAtPath(e,t,i))||!1:this.getObjectEntity().hasEffectsOnInteractionAtPath(e,t,i)}include(e,t){var i;this.deoptimized||this.applyDeoptimizations(),this.included=!0,null===(i=this.superClass)||void 0===i||i.include(e,t),this.body.include(e,t),this.id&&(this.id.markDeclarationReached(),this.id.include());}initialise(){var e;null===(e=this.id)||void 0===e||e.declare("class",this);for(const e of this.body.body)if(e instanceof zi&&"constructor"===e.kind)return void(this.classConstructor=e);this.classConstructor=null;}applyDeoptimizations(){this.deoptimized=!0;for(const e of this.body.body)e.static||e instanceof zi&&"constructor"===e.kind||e.deoptimizePath(B);this.context.requestTreeshakingPass();}getObjectEntity(){if(null!==this.objectEntity)return this.objectEntity;const e=[],t=[];for(const i of this.body.body){const s=i.static?e:t,n=i.kind;if(s===t&&!n)continue;const r="set"===n||"get"===n?n:"init";let a;if(i.computed){const e=i.key.getLiteralValueAtPath(V,G,this);if("symbol"==typeof e){s.push({key:M,kind:r,property:i});continue}a=String(e);}else a=i.key instanceof ni?i.key.name:String(i.key.value);s.push({key:a,kind:r,property:i});}return e.unshift({key:"prototype",kind:"init",property:new Et(t,this.superClass?new ji(this.superClass,"prototype"):St)}),this.objectEntity=new Et(e,this.superClass||St)}}class Gi extends Ui{initialise(){super.initialise(),null!==this.id&&(this.id.variable.isId=!0);}parseNode(e){null!==e.id&&(this.id=new ni(e.id,this,this.scope.parent)),super.parseNode(e);}render(e,t){const{exportNamesByVariable:i,format:s,snippets:{_:n}}=t;"system"===s&&this.id&&i.has(this.id.variable)&&e.appendLeft(this.end,`${n}${Si([this.id.variable],t)};`),super.render(e,t);}}class Hi extends K{constructor(e){super(),this.expressions=e,this.included=!1;}deoptimizePath(e){for(const t of this.expressions)t.deoptimizePath(e);}getReturnExpressionWhenCalledAtPath(e,t,i,s){return new Hi(this.expressions.map((n=>n.getReturnExpressionWhenCalledAtPath(e,t,i,s))))}hasEffectsOnInteractionAtPath(e,t,i){for(const s of this.expressions)if(s.hasEffectsOnInteractionAtPath(e,t,i))return !0;return !1}}class Wi extends ut{hasEffects(){return !1}initialise(){this.context.addExport(this);}render(e,t,i){e.remove(i.start,i.end);}applyDeoptimizations(){}}Wi.prototype.needsBoundaries=!0;class qi extends _i{initialise(){super.initialise(),null!==this.id&&(this.id.variable.isId=!0);}parseNode(e){null!==e.id&&(this.id=new ni(e.id,this,this.scope.parent)),super.parseNode(e);}}class Ki extends ut{include(e,t){super.include(e,t),t&&this.context.includeVariableInModule(this.variable);}initialise(){const e=this.declaration;this.declarationName=e.id&&e.id.name||this.declaration.name,this.variable=this.scope.addExportDefaultDeclaration(this.declarationName||this.context.getModuleName(),this,this.context),this.context.addExport(this);}render(e,t,i){const{start:s,end:n}=i,r=function(e,t){return ui(e,hi(e,"default",t)+7)}(e.original,this.start);if(this.declaration instanceof qi)this.renderNamedDeclaration(e,r,"function","(",null===this.declaration.id,t);else if(this.declaration instanceof Gi)this.renderNamedDeclaration(e,r,"class","{",null===this.declaration.id,t);else {if(this.variable.getOriginalVariable()!==this.variable)return void ai(this,e,s,n);if(!this.variable.included)return e.remove(this.start,r),this.declaration.render(e,t,{renderedSurroundingElement:"ExpressionStatement"}),void(";"!==e.original[this.end-1]&&e.appendLeft(this.end,";"));this.renderVariableDeclaration(e,r,t);}this.declaration.render(e,t);}applyDeoptimizations(){}renderNamedDeclaration(e,t,i,s,n,r){const{exportNamesByVariable:a,format:o,snippets:{getPropertyAccess:l}}=r,h=this.variable.getName(l);e.remove(this.start,t),n&&e.appendLeft(function(e,t,i,s){const n=hi(e,t,s)+t.length;e=e.slice(n,hi(e,i,n));const r=hi(e,"*");return -1===r?n:n+r+1}(e.original,i,s,t),` ${h}`),"system"===o&&this.declaration instanceof Gi&&a.has(this.variable)&&e.appendLeft(this.end,` ${Si([this.variable],r)};`);}renderVariableDeclaration(e,t,{format:i,exportNamesByVariable:s,snippets:{cnst:n,getPropertyAccess:r}}){const a=59===e.original.charCodeAt(this.end-1),o="system"===i&&s.get(this.variable);o?(e.overwrite(this.start,t,`${n} ${this.variable.getName(r)} = exports('${o[0]}', `),e.appendRight(a?this.end-1:this.end,")"+(a?"":";"))):(e.overwrite(this.start,t,`${n} ${this.variable.getName(r)} = `),a||e.appendLeft(this.end,";"));}}Ki.prototype.needsBoundaries=!0;class Xi extends ut{bind(){var e;null===(e=this.declaration)||void 0===e||e.bind();}hasEffects(e){var t;return !!(null===(t=this.declaration)||void 0===t?void 0:t.hasEffects(e))}initialise(){this.context.addExport(this);}render(e,t,i){const{start:s,end:n}=i;null===this.declaration?e.remove(s,n):(e.remove(this.start,this.declaration.start),this.declaration.render(e,t,{end:n,start:s}));}applyDeoptimizations(){}}Xi.prototype.needsBoundaries=!0;class Yi extends gi{constructor(){super(...arguments),this.hoistedDeclarations=[];}addDeclaration(e,t,i,s){return this.hoistedDeclarations.push(e),super.addDeclaration(e,t,i,s)}}const Qi=Symbol("unset");class Zi extends ut{constructor(){super(...arguments),this.testValue=Qi;}deoptimizeCache(){this.testValue=W;}hasEffects(e){var t;if(this.test.hasEffects(e))return !0;const i=this.getTestValue();if("symbol"==typeof i){const{brokenFlow:t}=e;if(this.consequent.hasEffects(e))return !0;const i=e.brokenFlow;return e.brokenFlow=t,null===this.alternate?!1:!!this.alternate.hasEffects(e)||(e.brokenFlow=e.brokenFlow<i?e.brokenFlow:i,!1)}return i?this.consequent.hasEffects(e):!!(null===(t=this.alternate)||void 0===t?void 0:t.hasEffects(e))}include(e,t){if(this.included=!0,t)this.includeRecursively(t,e);else {const t=this.getTestValue();"symbol"==typeof t?this.includeUnknownTest(e):this.includeKnownTest(e,t);}}parseNode(e){this.consequentScope=new Yi(this.scope),this.consequent=new(this.context.getNodeConstructor(e.consequent.type))(e.consequent,this,this.consequentScope),e.alternate&&(this.alternateScope=new Yi(this.scope),this.alternate=new(this.context.getNodeConstructor(e.alternate.type))(e.alternate,this,this.alternateScope)),super.parseNode(e);}render(e,t){const{snippets:{getPropertyAccess:i}}=t,s=this.getTestValue(),n=[],r=this.test.included,a=!this.context.options.treeshake;r?this.test.render(e,t):e.remove(this.start,this.consequent.start),this.consequent.included&&(a||"symbol"==typeof s||s)?this.consequent.render(e,t):(e.overwrite(this.consequent.start,this.consequent.end,r?";":""),n.push(...this.consequentScope.hoistedDeclarations)),this.alternate&&(!this.alternate.included||!a&&"symbol"!=typeof s&&s?(r&&this.shouldKeepAlternateBranch()?e.overwrite(this.alternate.start,this.end,";"):e.remove(this.consequent.end,this.end),n.push(...this.alternateScope.hoistedDeclarations)):(r?101===e.original.charCodeAt(this.alternate.start-1)&&e.prependLeft(this.alternate.start," "):e.remove(this.consequent.end,this.alternate.start),this.alternate.render(e,t))),this.renderHoistedDeclarations(n,e,i);}applyDeoptimizations(){}getTestValue(){return this.testValue===Qi?this.testValue=this.test.getLiteralValueAtPath(V,G,this):this.testValue}includeKnownTest(e,t){var i;this.test.shouldBeIncluded(e)&&this.test.include(e,!1),t&&this.consequent.shouldBeIncluded(e)&&this.consequent.include(e,!1,{asSingleStatement:!0}),!t&&(null===(i=this.alternate)||void 0===i?void 0:i.shouldBeIncluded(e))&&this.alternate.include(e,!1,{asSingleStatement:!0});}includeRecursively(e,t){var i;this.test.include(t,e),this.consequent.include(t,e),null===(i=this.alternate)||void 0===i||i.include(t,e);}includeUnknownTest(e){var t;this.test.include(e,!1);const{brokenFlow:i}=e;let s=0;this.consequent.shouldBeIncluded(e)&&(this.consequent.include(e,!1,{asSingleStatement:!0}),s=e.brokenFlow,e.brokenFlow=i),(null===(t=this.alternate)||void 0===t?void 0:t.shouldBeIncluded(e))&&(this.alternate.include(e,!1,{asSingleStatement:!0}),e.brokenFlow=e.brokenFlow<s?e.brokenFlow:s);}renderHoistedDeclarations(e,t,i){const s=[...new Set(e.map((e=>{const t=e.variable;return t.included?t.getName(i):""})))].filter(Boolean).join(", ");if(s){const e=this.parent.type,i="Program"!==e&&"BlockStatement"!==e;t.prependRight(this.start,`${i?"{ ":""}var ${s}; `),i&&t.appendLeft(this.end," }");}}shouldKeepAlternateBranch(){let e=this.parent;do{if(e instanceof Zi&&e.alternate)return !0;if(e instanceof xi)return !1;e=e.parent;}while(e);return !1}}class Ji extends ut{bind(){}hasEffects(){return !1}initialise(){this.context.addImport(this);}render(e,t,i){e.remove(i.start,i.end);}applyDeoptimizations(){}}Ji.prototype.needsBoundaries=!0;const es={auto:"_interopDefault",default:null,defaultOnly:null,esModule:null,false:null,true:"_interopDefaultLegacy"},ts=(e,t)=>"esModule"===e||t&&("auto"===e||"true"===e),is={auto:"_interopNamespace",default:"_interopNamespaceDefault",defaultOnly:"_interopNamespaceDefaultOnly",esModule:null,false:null,true:"_interopNamespace"},ss=(e,t)=>ts(e,t)&&"_interopDefault"===es[e],ns=(e,t,i,s,n,r,a)=>{const o=new Set(e);for(const e of ys)t.has(e)&&o.add(e);return ys.map((e=>o.has(e)?rs[e](i,s,n,r,a,o):"")).join("")},rs={_interopDefaultLegacy(e,t,i){const{_:s,getDirectReturnFunction:n,n:r}=t,[a,o]=n(["e"],{functionReturn:!0,lineBreakIndent:null,name:"_interopDefaultLegacy"});return `${a}e${s}&&${s}typeof e${s}===${s}'object'${s}&&${s}'default'${s}in e${s}?${s}${i?as(t):os(t)}${o}${r}${r}`},_interopDefault(e,t,i){const{_:s,getDirectReturnFunction:n,n:r}=t,[a,o]=n(["e"],{functionReturn:!0,lineBreakIndent:null,name:"_interopDefault"});return `${a}e${s}&&${s}e.__esModule${s}?${s}${i?as(t):os(t)}${o}${r}${r}`},_interopNamespaceDefaultOnly(e,t,i,s,n){const{getDirectReturnFunction:r,getObject:a,n:o}=t,[l,h]=r(["e"],{functionReturn:!0,lineBreakIndent:null,name:"_interopNamespaceDefaultOnly"});return `${l}${ms(s,gs(n,a([["__proto__","null"],["default","e"]],{lineBreakIndent:null}),t))}${h}${o}${o}`},_interopNamespaceDefault(e,t,i,s,n){const{_:r,n:a}=t;return `function _interopNamespaceDefault(e)${r}{${a}`+ls(e,e,t,i,s,n)+`}${a}${a}`},_interopNamespace(e,t,i,s,n,r){const{_:a,getDirectReturnFunction:o,n:l}=t;if(r.has("_interopNamespaceDefault")){const[e,t]=o(["e"],{functionReturn:!0,lineBreakIndent:null,name:"_interopNamespace"});return `${e}e${a}&&${a}e.__esModule${a}?${a}e${a}:${a}_interopNamespaceDefault(e)${t}${l}${l}`}return `function _interopNamespace(e)${a}{${l}${e}if${a}(e${a}&&${a}e.__esModule)${a}return e;${l}`+ls(e,e,t,i,s,n)+`}${l}${l}`},_mergeNamespaces(e,t,i,s,n){const{_:r,cnst:a,n:o}=t,l="var"===a&&i;return `function _mergeNamespaces(n, m)${r}{${o}${e}${cs(`{${o}${e}${e}${e}if${r}(k${r}!==${r}'default'${r}&&${r}!(k in n))${r}{${o}`+(i?l?ds:ps:fs)(e,e+e+e+e,t)+`${e}${e}${e}}${o}`+`${e}${e}}`,l,e,t)}${o}${e}return ${ms(s,gs(n,"n",t))};${o}}${o}${o}`}},as=({_:e,getObject:t})=>`e${e}:${e}${t([["default","e"]],{lineBreakIndent:null})}`,os=({_:e,getPropertyAccess:t})=>`e${t("default")}${e}:${e}e`,ls=(e,t,i,s,n,r)=>{const{_:a,cnst:o,getObject:l,getPropertyAccess:h,n:c,s:u}=i,d=`{${c}`+(s?us:fs)(e,t+e+e,i)+`${t}${e}}`;return `${t}${o} n${a}=${a}Object.create(null${r?`,${a}{${a}[Symbol.toStringTag]:${a}${xs(l)}${a}}`:""});${c}${t}if${a}(e)${a}{${c}${t}${e}${hs(d,!s,i)}${c}${t}}${c}${t}n${h("default")}${a}=${a}e;${c}${t}return ${ms(n,"n")}${u}${c}`},hs=(e,t,{_:i,cnst:s,getFunctionIntro:n,s:r})=>"var"!==s||t?`for${i}(${s} k in e)${i}${e}`:`Object.keys(e).forEach(${n(["k"],{isAsync:!1,name:null})}${e})${r}`,cs=(e,t,i,{_:s,cnst:n,getDirectReturnFunction:r,getFunctionIntro:a,n:o})=>{if(t){const[t,n]=r(["e"],{functionReturn:!1,lineBreakIndent:{base:i,t:i},name:null});return `m.forEach(${t}e${s}&&${s}typeof e${s}!==${s}'string'${s}&&${s}!Array.isArray(e)${s}&&${s}Object.keys(e).forEach(${a(["k"],{isAsync:!1,name:null})}${e})${n});`}return `for${s}(var i${s}=${s}0;${s}i${s}<${s}m.length;${s}i++)${s}{${o}${i}${i}${n} e${s}=${s}m[i];${o}${i}${i}if${s}(typeof e${s}!==${s}'string'${s}&&${s}!Array.isArray(e))${s}{${s}for${s}(${n} k in e)${s}${e}${s}}${o}${i}}`},us=(e,t,i)=>{const{_:s,n:n}=i;return `${t}if${s}(k${s}!==${s}'default')${s}{${n}`+ds(e,t+e,i)+`${t}}${n}`},ds=(e,t,{_:i,cnst:s,getDirectReturnFunction:n,n:r})=>{const[a,o]=n([],{functionReturn:!0,lineBreakIndent:null,name:null});return `${t}${s} d${i}=${i}Object.getOwnPropertyDescriptor(e,${i}k);${r}${t}Object.defineProperty(n,${i}k,${i}d.get${i}?${i}d${i}:${i}{${r}${t}${e}enumerable:${i}true,${r}${t}${e}get:${i}${a}e[k]${o}${r}${t}});${r}`},ps=(e,t,{_:i,cnst:s,getDirectReturnFunction:n,n:r})=>{const[a,o]=n([],{functionReturn:!0,lineBreakIndent:null,name:null});return `${t}${s} d${i}=${i}Object.getOwnPropertyDescriptor(e,${i}k);${r}${t}if${i}(d)${i}{${r}${t}${e}Object.defineProperty(n,${i}k,${i}d.get${i}?${i}d${i}:${i}{${r}${t}${e}${e}enumerable:${i}true,${r}${t}${e}${e}get:${i}${a}e[k]${o}${r}${t}${e}});${r}${t}}${r}`},fs=(e,t,{_:i,n:s})=>`${t}n[k]${i}=${i}e[k];${s}`,ms=(e,t)=>e?`Object.freeze(${t})`:t,gs=(e,t,{_:i,getObject:s})=>e?`Object.defineProperty(${t},${i}Symbol.toStringTag,${i}${xs(s)})`:t,ys=Object.keys(rs);function xs(e){return e([["value","'Module'"]],{lineBreakIndent:null})}function Es(e,t,i){return "external"===t?is[String(i(e instanceof $e?e.id:null))]:"default"===t?"_interopNamespaceDefaultOnly":null}const bs={amd:["require"],cjs:["require"],system:["module"]};const vs="ROLLUP_ASSET_URL_",Ss="ROLLUP_FILE_URL_";const As={amd:["document","module","URL"],cjs:["document","require","URL"],es:[],iife:["document","URL"],system:["module"],umd:["document","require","URL"]},Is={amd:["document","require","URL"],cjs:["document","require","URL"],es:[],iife:["document","URL"],system:["module","URL"],umd:["document","require","URL"]},ks=(e,t="URL")=>`new ${t}(${e}).href`,Ps=(e,t=!1)=>ks(`'${e}', ${t?"typeof document === 'undefined' ? location.href : ":""}document.currentScript && document.currentScript.src || document.baseURI`),ws=e=>(t,{chunkId:i})=>{const s=e(i);return null===t?`({ url: ${s} })`:"url"===t?s:"undefined"},Cs=(e,t=!1)=>`${t?"typeof document === 'undefined' ? location.href : ":""}(document.currentScript && document.currentScript.src || new URL('${e}', document.baseURI).href)`,_s={amd:e=>("."!==e[0]&&(e="./"+e),ks(`require.toUrl('${e}'), document.baseURI`)),cjs:e=>`(typeof document === 'undefined' ? ${ks(`'file:' + __dirname + '/${e}'`,"(require('u' + 'rl').URL)")} : ${Ps(e)})`,es:e=>ks(`'${e}', import.meta.url`),iife:e=>Ps(e),system:e=>ks(`'${e}', module.meta.url`),umd:e=>`(typeof document === 'undefined' && typeof location === 'undefined' ? ${ks(`'file:' + __dirname + '/${e}'`,"(require('u' + 'rl').URL)")} : ${Ps(e,!0)})`},Ns={amd:ws((()=>ks("module.uri, document.baseURI"))),cjs:ws((e=>`(typeof document === 'undefined' ? ${ks("'file:' + __filename","(require('u' + 'rl').URL)")} : ${Cs(e)})`)),iife:ws((e=>Cs(e))),system:(e,{snippets:{getPropertyAccess:t}})=>null===e?"module.meta":`module.meta${t(e)}`,umd:ws((e=>`(typeof document === 'undefined' && typeof location === 'undefined' ? ${ks("'file:' + __filename","(require('u' + 'rl').URL)")} : ${Cs(e,!0)})`))};class $s extends ut{constructor(){super(...arguments),this.hasCachedEffect=!1;}hasEffects(e){if(this.hasCachedEffect)return !0;for(const t of this.body)if(t.hasEffects(e))return this.hasCachedEffect=!0;return !1}include(e,t){this.included=!0;for(const i of this.body)(t||i.shouldBeIncluded(e))&&i.include(e,t);}render(e,t){this.body.length?pi(this.body,e,this.start,this.end,t):super.render(e,t);}applyDeoptimizations(){}}class Ts extends ut{hasEffects(e){var t;if(null===(t=this.test)||void 0===t?void 0:t.hasEffects(e))return !0;for(const t of this.consequent){if(e.brokenFlow)break;if(t.hasEffects(e))return !0}return !1}include(e,t){var i;this.included=!0,null===(i=this.test)||void 0===i||i.include(e,t);for(const i of this.consequent)(t||i.shouldBeIncluded(e))&&i.include(e,t);}render(e,t,i){if(this.consequent.length){this.test&&this.test.render(e,t);const s=this.test?this.test.end:hi(e.original,"default",this.start)+7,n=hi(e.original,":",s)+1;pi(this.consequent,e,n,i.end,t);}else super.render(e,t);}}Ts.prototype.needsBoundaries=!0;class Os extends ut{deoptimizeThisOnInteractionAtPath(){}getLiteralValueAtPath(e){return e.length>0||1!==this.quasis.length?W:this.quasis[0].value.cooked}getReturnExpressionWhenCalledAtPath(e){return 1!==e.length?X:Qe(Xe,e[0])}hasEffectsOnInteractionAtPath(e,t,i){return 0===t.type?e.length>1:2!==t.type||1!==e.length||Ye(Xe,e[0],t,i)}render(e,t){e.indentExclusionRanges.push([this.start,this.end]),super.render(e,t);}}class Rs extends ee{constructor(){super("undefined");}getLiteralValueAtPath(){}}class Ms extends Dt{constructor(e,t,i){super(e,t,t.declaration,i),this.hasId=!1,this.originalId=null,this.originalVariable=null;const s=t.declaration;(s instanceof qi||s instanceof Gi)&&s.id?(this.hasId=!0,this.originalId=s.id):s instanceof ni&&(this.originalId=s);}addReference(e){this.hasId||(this.name=e.name);}getAssignedVariableName(){return this.originalId&&this.originalId.name||null}getBaseVariableName(){const e=this.getOriginalVariable();return e===this?super.getBaseVariableName():e.getBaseVariableName()}getDirectOriginalVariable(){return !this.originalId||!this.hasId&&(this.originalId.isPossibleTDZ()||this.originalId.variable.isReassigned||this.originalId.variable instanceof Rs||"syntheticNamespace"in this.originalId.variable)?null:this.originalId.variable}getName(e){const t=this.getOriginalVariable();return t===this?super.getName(e):t.getName(e)}getOriginalVariable(){if(this.originalVariable)return this.originalVariable;let e,t=this;const i=new Set;do{i.add(t),e=t,t=e.getDirectOriginalVariable();}while(t instanceof Ms&&!i.has(t));return this.originalVariable=t||e}}class Ds extends Ft{constructor(e,t){super(e),this.context=t,this.variables.set("this",new Dt("this",null,Le,t));}addExportDefaultDeclaration(e,t,i){const s=new Ms(e,t,i);return this.variables.set("default",s),s}addNamespaceMemberAccess(){}deconflict(e,t,i){for(const s of this.children)s.deconflict(e,t,i);}findLexicalBoundary(){return this}findVariable(e){const t=this.variables.get(e)||this.accessedOutsideVariables.get(e);if(t)return t;const i=this.context.traceVariable(e)||this.parent.findVariable(e);return i instanceof ii&&this.accessedOutsideVariables.set(e,i),i}}const Ls={"!":e=>!e,"+":e=>+e,"-":e=>-e,delete:()=>W,typeof:e=>typeof e,void:()=>{},"~":e=>~e};function Vs(e,t){return null!==e.renderBaseName&&t.has(e)&&e.isReassigned}class Bs extends ut{deoptimizePath(){for(const e of this.declarations)e.deoptimizePath(V);}hasEffectsOnInteractionAtPath(){return !1}include(e,t,{asSingleStatement:i}=ie){this.included=!0;for(const s of this.declarations)(t||s.shouldBeIncluded(e))&&s.include(e,t),i&&s.id.include(e,t);}initialise(){for(const e of this.declarations)e.declareDeclarator(this.kind);}render(e,t,i=ie){if(function(e,t){for(const i of e){if(!i.id.included)return !1;if("Identifier"===i.id.type){if(t.has(i.id.variable))return !1}else {const e=[];if(i.id.addExportedVariables(e,t),e.length>0)return !1}}return !0}(this.declarations,t.exportNamesByVariable)){for(const i of this.declarations)i.render(e,t);i.isNoStatement||59===e.original.charCodeAt(this.end-1)||e.appendLeft(this.end,";");}else this.renderReplacedDeclarations(e,t);}applyDeoptimizations(){}renderDeclarationEnd(e,t,i,s,n,r,a){59===e.original.charCodeAt(this.end-1)&&e.remove(this.end-1,this.end),t+=";",null!==i?(10!==e.original.charCodeAt(s-1)||10!==e.original.charCodeAt(this.end)&&13!==e.original.charCodeAt(this.end)||(s--,13===e.original.charCodeAt(s)&&s--),s===i+1?e.overwrite(i,n,t):(e.overwrite(i,i+1,t),e.remove(s,n))):e.appendLeft(n,t),r.length>0&&e.appendLeft(n,` ${Si(r,a)};`);}renderReplacedDeclarations(e,t){const i=fi(this.declarations,e,this.start+this.kind.length,this.end-(59===e.original.charCodeAt(this.end-1)?1:0));let s,n;n=ui(e.original,this.start+this.kind.length);let r=n-1;e.remove(this.start,r);let a,l=!1,h=!1,c="";const u=[],d=function(e,t,i){var s;let n=null;if("system"===t.format){for(const{node:r}of e)r.id instanceof ni&&r.init&&0===i.length&&1===(null===(s=t.exportNamesByVariable.get(r.id.variable))||void 0===s?void 0:s.length)?(n=r.id.variable,i.push(n)):r.id.addExportedVariables(i,t.exportNamesByVariable);i.length>1?n=null:n&&(i.length=0);}return n}(i,t,u);for(const{node:u,start:p,separator:f,contentEnd:m,end:g}of i)if(u.included){if(u.render(e,t),a="",!u.id.included||u.id instanceof ni&&Vs(u.id.variable,t.exportNamesByVariable))h&&(c+=";"),l=!1;else {if(d&&d===u.id.variable){const i=hi(e.original,"=",u.id.end);Ai(d,ui(e.original,i+1),null===f?m:f,e,t);}l?c+=",":(h&&(c+=";"),a+=`${this.kind} `,l=!0);}n===r+1?e.overwrite(r,n,c+a):(e.overwrite(r,r+1,c),e.appendLeft(n,a)),s=m,n=g,h=!0,r=f,c="";}else e.remove(p,g);this.renderDeclarationEnd(e,c,r,s,n,u,t);}}const Fs={ArrayExpression:class extends ut{constructor(){super(...arguments),this.objectEntity=null;}deoptimizePath(e){this.getObjectEntity().deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){this.getObjectEntity().deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){return this.getObjectEntity().getLiteralValueAtPath(e,t,i)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.getObjectEntity().getReturnExpressionWhenCalledAtPath(e,t,i,s)}hasEffectsOnInteractionAtPath(e,t,i){return this.getObjectEntity().hasEffectsOnInteractionAtPath(e,t,i)}applyDeoptimizations(){this.deoptimized=!0;let e=!1;for(let t=0;t<this.elements.length;t++){const i=this.elements[t];i&&(e||i instanceof dt)&&(e=!0,i.deoptimizePath(B));}this.context.requestTreeshakingPass();}getObjectEntity(){if(null!==this.objectEntity)return this.objectEntity;const e=[{key:"length",kind:"init",property:ze}];let t=!1;for(let i=0;i<this.elements.length;i++){const s=this.elements[i];t||s instanceof dt?s&&(t=!0,e.unshift({key:L,kind:"init",property:s})):s?e.push({key:String(i),kind:"init",property:s}):e.push({key:String(i),kind:"init",property:Le});}return this.objectEntity=new Et(e,Mt)}},ArrayPattern:class extends ut{addExportedVariables(e,t){for(const i of this.elements)null==i||i.addExportedVariables(e,t);}declare(e){const t=[];for(const i of this.elements)null!==i&&t.push(...i.declare(e,X));return t}deoptimizePath(){for(const e of this.elements)null==e||e.deoptimizePath(V);}hasEffectsOnInteractionAtPath(e,t,i){for(const e of this.elements)if(null==e?void 0:e.hasEffectsOnInteractionAtPath(V,t,i))return !0;return !1}markDeclarationReached(){for(const e of this.elements)null==e||e.markDeclarationReached();}},ArrowFunctionExpression:vi,AssignmentExpression:class extends ut{hasEffects(e){const{deoptimized:t,left:i,right:s}=this;return t||this.applyDeoptimizations(),s.hasEffects(e)||i.hasEffectsAsAssignmentTarget(e,"="!==this.operator)}hasEffectsOnInteractionAtPath(e,t,i){return this.right.hasEffectsOnInteractionAtPath(e,t,i)}include(e,t){const{deoptimized:i,left:s,right:n,operator:r}=this;i||this.applyDeoptimizations(),this.included=!0,(t||"="!==r||s.included||s.hasEffectsAsAssignmentTarget(Me(),!1))&&s.includeAsAssignmentTarget(e,t,"="!==r),n.include(e,t);}initialise(){this.left.setAssignedValue(this.right);}render(e,t,{preventASI:i,renderedParentType:s,renderedSurroundingElement:n}=ie){const{left:r,right:a,start:o,end:l,parent:h}=this;if(r.included)r.render(e,t),a.render(e,t);else {const l=ui(e.original,hi(e.original,"=",r.end)+1);e.remove(o,l),i&&mi(e,l,a.start),a.render(e,t,{renderedParentType:s||h.type,renderedSurroundingElement:n||h.type});}if("system"===t.format)if(r instanceof ni){const i=r.variable,s=t.exportNamesByVariable.get(i);if(s)return void(1===s.length?Ai(i,o,l,e,t):Ii(i,o,l,"ExpressionStatement"!==h.type,e,t))}else {const i=[];if(r.addExportedVariables(i,t.exportNamesByVariable),i.length>0)return void function(e,t,i,s,n,r){const{_:a,getDirectReturnIifeLeft:o}=r.snippets;n.prependRight(t,o(["v"],`${Si(e,r)},${a}v`,{needsArrowReturnParens:!0,needsWrappedFunction:s})),n.appendLeft(i,")");}(i,o,l,"ExpressionStatement"===n,e,t)}r.included&&r instanceof ki&&("ExpressionStatement"===n||"ArrowFunctionExpression"===n)&&(e.appendRight(o,"("),e.prependLeft(l,")"));}applyDeoptimizations(){this.deoptimized=!0,this.left.deoptimizePath(V),this.right.deoptimizePath(B),this.context.requestTreeshakingPass();}},AssignmentPattern:class extends ut{addExportedVariables(e,t){this.left.addExportedVariables(e,t);}declare(e,t){return this.left.declare(e,t)}deoptimizePath(e){0===e.length&&this.left.deoptimizePath(e);}hasEffectsOnInteractionAtPath(e,t,i){return e.length>0||this.left.hasEffectsOnInteractionAtPath(V,t,i)}markDeclarationReached(){this.left.markDeclarationReached();}render(e,t,{isShorthandProperty:i}=ie){this.left.render(e,t,{isShorthandProperty:i}),this.right.render(e,t);}applyDeoptimizations(){this.deoptimized=!0,this.left.deoptimizePath(V),this.right.deoptimizePath(B),this.context.requestTreeshakingPass();}},AwaitExpression:class extends ut{hasEffects(){return this.deoptimized||this.applyDeoptimizations(),!0}include(e,t){if(this.deoptimized||this.applyDeoptimizations(),!this.included){this.included=!0;e:if(!this.context.usesTopLevelAwait){let e=this.parent;do{if(e instanceof _i||e instanceof vi)break e}while(e=e.parent);this.context.usesTopLevelAwait=!0;}}this.argument.include(e,t);}},BinaryExpression:class extends ut{deoptimizeCache(){}getLiteralValueAtPath(e,t,i){if(e.length>0)return W;const s=this.left.getLiteralValueAtPath(V,t,i);if("symbol"==typeof s)return W;const n=this.right.getLiteralValueAtPath(V,t,i);if("symbol"==typeof n)return W;const r=Ni[this.operator];return r?r(s,n):W}hasEffects(e){return "+"===this.operator&&this.parent instanceof yi&&""===this.left.getLiteralValueAtPath(V,G,this)||super.hasEffects(e)}hasEffectsOnInteractionAtPath(e,{type:t}){return 0!==t||e.length>1}render(e,t,{renderedSurroundingElement:i}=ie){this.left.render(e,t,{renderedSurroundingElement:i}),this.right.render(e,t);}},BlockStatement:xi,BreakStatement:class extends ut{hasEffects(e){if(this.label){if(!e.ignore.labels.has(this.label.name))return !0;e.includedLabels.add(this.label.name),e.brokenFlow=2;}else {if(!e.ignore.breaks)return !0;e.brokenFlow=1;}return !1}include(e){this.included=!0,this.label&&(this.label.include(),e.includedLabels.add(this.label.name)),e.brokenFlow=this.label?2:1;}},CallExpression:class extends Li{bind(){if(super.bind(),this.callee instanceof ni){this.scope.findVariable(this.callee.name).isNamespace&&this.context.warn({code:"CANNOT_CALL_NAMESPACE",message:`Cannot call a namespace ('${this.callee.name}')`},this.start),"eval"===this.callee.name&&this.context.warn({code:"EVAL",message:"Use of eval is strongly discouraged, as it poses security risks and may cause issues with minification",url:"https://rollupjs.org/guide/en/#avoiding-eval"},this.start);}this.interaction={args:this.arguments,thisArg:this.callee instanceof Mi&&!this.callee.variable?this.callee.object:null,type:2,withNew:!1};}hasEffects(e){try{for(const t of this.arguments)if(t.hasEffects(e))return !0;return (!this.context.options.treeshake.annotations||!this.annotations)&&(this.callee.hasEffects(e)||this.callee.hasEffectsOnInteractionAtPath(V,this.interaction,e))}finally{this.deoptimized||this.applyDeoptimizations();}}include(e,t){this.deoptimized||this.applyDeoptimizations(),t?(super.include(e,t),"variables"===t&&this.callee instanceof ni&&this.callee.variable&&this.callee.variable.markCalledFromTryStatement()):(this.included=!0,this.callee.include(e,!1)),this.callee.includeCallArguments(e,this.arguments);}render(e,t,{renderedSurroundingElement:i}=ie){this.callee.render(e,t,{isCalleeOfRenderedParent:!0,renderedSurroundingElement:i}),$i(e,t,this);}applyDeoptimizations(){this.deoptimized=!0,this.interaction.thisArg&&this.callee.deoptimizeThisOnInteractionAtPath(this.interaction,V,G);for(const e of this.arguments)e.deoptimizePath(B);this.context.requestTreeshakingPass();}getReturnExpression(e=G){return null===this.returnExpression?(this.returnExpression=X,this.returnExpression=this.callee.getReturnExpressionWhenCalledAtPath(V,this.interaction,e,this)):this.returnExpression}},CatchClause:class extends ut{createScope(e){this.scope=new Vi(e,this.context);}parseNode(e){const{param:t}=e;t&&(this.param=new(this.context.getNodeConstructor(t.type))(t,this,this.scope),this.param.declare("parameter",X)),super.parseNode(e);}},ChainExpression:class extends ut{},ClassBody:class extends ut{createScope(e){this.scope=new Bi(e,this.parent,this.context);}include(e,t){this.included=!0,this.context.includeVariableInModule(this.scope.thisVariable);for(const i of this.body)i.include(e,t);}parseNode(e){const t=this.body=[];for(const i of e.body)t.push(new(this.context.getNodeConstructor(i.type))(i,this,i.static?this.scope:this.scope.instanceScope));super.parseNode(e);}applyDeoptimizations(){}},ClassDeclaration:Gi,ClassExpression:class extends Ui{render(e,t,{renderedSurroundingElement:i}=ie){super.render(e,t),"ExpressionStatement"===i&&(e.appendRight(this.start,"("),e.prependLeft(this.end,")"));}},ConditionalExpression:class extends ut{constructor(){super(...arguments),this.expressionsToBeDeoptimized=[],this.isBranchResolutionAnalysed=!1,this.usedBranch=null;}deoptimizeCache(){if(null!==this.usedBranch){const e=this.usedBranch===this.consequent?this.alternate:this.consequent;this.usedBranch=null,e.deoptimizePath(B);for(const e of this.expressionsToBeDeoptimized)e.deoptimizeCache();}}deoptimizePath(e){const t=this.getUsedBranch();t?t.deoptimizePath(e):(this.consequent.deoptimizePath(e),this.alternate.deoptimizePath(e));}deoptimizeThisOnInteractionAtPath(e,t,i){this.consequent.deoptimizeThisOnInteractionAtPath(e,t,i),this.alternate.deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){const s=this.getUsedBranch();return s?(this.expressionsToBeDeoptimized.push(i),s.getLiteralValueAtPath(e,t,i)):W}getReturnExpressionWhenCalledAtPath(e,t,i,s){const n=this.getUsedBranch();return n?(this.expressionsToBeDeoptimized.push(s),n.getReturnExpressionWhenCalledAtPath(e,t,i,s)):new Hi([this.consequent.getReturnExpressionWhenCalledAtPath(e,t,i,s),this.alternate.getReturnExpressionWhenCalledAtPath(e,t,i,s)])}hasEffects(e){if(this.test.hasEffects(e))return !0;const t=this.getUsedBranch();return t?t.hasEffects(e):this.consequent.hasEffects(e)||this.alternate.hasEffects(e)}hasEffectsOnInteractionAtPath(e,t,i){const s=this.getUsedBranch();return s?s.hasEffectsOnInteractionAtPath(e,t,i):this.consequent.hasEffectsOnInteractionAtPath(e,t,i)||this.alternate.hasEffectsOnInteractionAtPath(e,t,i)}include(e,t){this.included=!0;const i=this.getUsedBranch();t||this.test.shouldBeIncluded(e)||null===i?(this.test.include(e,t),this.consequent.include(e,t),this.alternate.include(e,t)):i.include(e,t);}includeCallArguments(e,t){const i=this.getUsedBranch();i?i.includeCallArguments(e,t):(this.consequent.includeCallArguments(e,t),this.alternate.includeCallArguments(e,t));}render(e,t,{isCalleeOfRenderedParent:i,preventASI:s,renderedParentType:n,renderedSurroundingElement:r}=ie){const a=this.getUsedBranch();if(this.test.included)this.test.render(e,t,{renderedSurroundingElement:r}),this.consequent.render(e,t),this.alternate.render(e,t);else {const o=hi(e.original,":",this.consequent.end),l=ui(e.original,(this.consequent.included?hi(e.original,"?",this.test.end):o)+1);s&&mi(e,l,a.start),e.remove(this.start,l),this.consequent.included&&e.remove(o,this.end),oi(this,e),a.render(e,t,{isCalleeOfRenderedParent:i,preventASI:!0,renderedParentType:n||this.parent.type,renderedSurroundingElement:r||this.parent.type});}}getUsedBranch(){if(this.isBranchResolutionAnalysed)return this.usedBranch;this.isBranchResolutionAnalysed=!0;const e=this.test.getLiteralValueAtPath(V,G,this);return "symbol"==typeof e?null:this.usedBranch=e?this.consequent:this.alternate}},ContinueStatement:class extends ut{hasEffects(e){if(this.label){if(!e.ignore.labels.has(this.label.name))return !0;e.includedLabels.add(this.label.name),e.brokenFlow=2;}else {if(!e.ignore.continues)return !0;e.brokenFlow=1;}return !1}include(e){this.included=!0,this.label&&(this.label.include(),e.includedLabels.add(this.label.name)),e.brokenFlow=this.label?2:1;}},DoWhileStatement:class extends ut{hasEffects(e){if(this.test.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:i,continues:s}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=i,e.ignore.continues=s,e.brokenFlow=t,!1)}include(e,t){this.included=!0,this.test.include(e,t);const{brokenFlow:i}=e;this.body.include(e,t,{asSingleStatement:!0}),e.brokenFlow=i;}},EmptyStatement:class extends ut{hasEffects(){return !1}},ExportAllDeclaration:Wi,ExportDefaultDeclaration:Ki,ExportNamedDeclaration:Xi,ExportSpecifier:class extends ut{applyDeoptimizations(){}},ExpressionStatement:yi,ForInStatement:class extends ut{createScope(e){this.scope=new gi(e);}hasEffects(e){const{deoptimized:t,left:i,right:s}=this;if(t||this.applyDeoptimizations(),i.hasEffectsAsAssignmentTarget(e,!1)||s.hasEffects(e))return !0;const{brokenFlow:n,ignore:{breaks:r,continues:a}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=r,e.ignore.continues=a,e.brokenFlow=n,!1)}include(e,t){const{body:i,deoptimized:s,left:n,right:r}=this;s||this.applyDeoptimizations(),this.included=!0,n.includeAsAssignmentTarget(e,t||!0,!1),r.include(e,t);const{brokenFlow:a}=e;i.include(e,t,{asSingleStatement:!0}),e.brokenFlow=a;}initialise(){this.left.setAssignedValue(X);}render(e,t){this.left.render(e,t,li),this.right.render(e,t,li),110===e.original.charCodeAt(this.right.start-1)&&e.prependLeft(this.right.start," "),this.body.render(e,t);}applyDeoptimizations(){this.deoptimized=!0,this.left.deoptimizePath(V),this.context.requestTreeshakingPass();}},ForOfStatement:class extends ut{createScope(e){this.scope=new gi(e);}hasEffects(){return this.deoptimized||this.applyDeoptimizations(),!0}include(e,t){const{body:i,deoptimized:s,left:n,right:r}=this;s||this.applyDeoptimizations(),this.included=!0,n.includeAsAssignmentTarget(e,t||!0,!1),r.include(e,t);const{brokenFlow:a}=e;i.include(e,t,{asSingleStatement:!0}),e.brokenFlow=a;}initialise(){this.left.setAssignedValue(X);}render(e,t){this.left.render(e,t,li),this.right.render(e,t,li),102===e.original.charCodeAt(this.right.start-1)&&e.prependLeft(this.right.start," "),this.body.render(e,t);}applyDeoptimizations(){this.deoptimized=!0,this.left.deoptimizePath(V),this.context.requestTreeshakingPass();}},ForStatement:class extends ut{createScope(e){this.scope=new gi(e);}hasEffects(e){var t,i,s;if((null===(t=this.init)||void 0===t?void 0:t.hasEffects(e))||(null===(i=this.test)||void 0===i?void 0:i.hasEffects(e))||(null===(s=this.update)||void 0===s?void 0:s.hasEffects(e)))return !0;const{brokenFlow:n,ignore:{breaks:r,continues:a}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=r,e.ignore.continues=a,e.brokenFlow=n,!1)}include(e,t){var i,s,n;this.included=!0,null===(i=this.init)||void 0===i||i.include(e,t,{asSingleStatement:!0}),null===(s=this.test)||void 0===s||s.include(e,t);const{brokenFlow:r}=e;null===(n=this.update)||void 0===n||n.include(e,t),this.body.include(e,t,{asSingleStatement:!0}),e.brokenFlow=r;}render(e,t){var i,s,n;null===(i=this.init)||void 0===i||i.render(e,t,li),null===(s=this.test)||void 0===s||s.render(e,t,li),null===(n=this.update)||void 0===n||n.render(e,t,li),this.body.render(e,t);}},FunctionDeclaration:qi,FunctionExpression:class extends _i{render(e,t,{renderedSurroundingElement:i}=ie){super.render(e,t),"ExpressionStatement"===i&&(e.appendRight(this.start,"("),e.prependLeft(this.end,")"));}},Identifier:ni,IfStatement:Zi,ImportDeclaration:Ji,ImportDefaultSpecifier:class extends ut{applyDeoptimizations(){}},ImportExpression:class extends ut{constructor(){super(...arguments),this.inlineNamespace=null,this.mechanism=null,this.resolution=null;}hasEffects(){return !0}include(e,t){this.included||(this.included=!0,this.context.includeDynamicImport(this),this.scope.addAccessedDynamicImport(this)),this.source.include(e,t);}initialise(){this.context.addDynamicImport(this);}render(e,t){if(this.inlineNamespace){const{snippets:{getDirectReturnFunction:i,getPropertyAccess:s}}=t,[n,r]=i([],{functionReturn:!0,lineBreakIndent:null,name:null});e.overwrite(this.start,this.end,`Promise.resolve().then(${n}${this.inlineNamespace.getName(s)}${r})`,{contentOnly:!0});}else this.mechanism&&(e.overwrite(this.start,hi(e.original,"(",this.start+6)+1,this.mechanism.left,{contentOnly:!0}),e.overwrite(this.end-1,this.end,this.mechanism.right,{contentOnly:!0})),this.source.render(e,t);}renderFinalResolution(e,t,i,{getDirectReturnFunction:s}){if(e.overwrite(this.source.start,this.source.end,t),i){const[t,n]=s(["n"],{functionReturn:!0,lineBreakIndent:null,name:null});e.prependLeft(this.end,`.then(${t}n.${i}${n})`);}}setExternalResolution(e,t,i,s,n,r){const{format:a}=i;this.resolution=t;const o=[...bs[a]||[]];let l;(({helper:l,mechanism:this.mechanism}=this.getDynamicImportMechanismAndHelper(t,e,i,s,n))),l&&o.push(l),o.length>0&&this.scope.addAccessedGlobals(o,r);}setInternalResolution(e){this.inlineNamespace=e;}applyDeoptimizations(){}getDynamicImportMechanismAndHelper(e,t,{compact:i,dynamicImportFunction:s,format:n,generatedCode:{arrowFunctions:r},interop:a},{_:o,getDirectReturnFunction:l,getDirectReturnIifeLeft:h},c){const u=c.hookFirstSync("renderDynamicImport",[{customResolution:"string"==typeof this.resolution?this.resolution:null,format:n,moduleId:this.context.module.id,targetModuleId:this.resolution&&"string"!=typeof this.resolution?this.resolution.id:null}]);if(u)return {helper:null,mechanism:u};const d=!this.resolution||"string"==typeof this.resolution;switch(n){case"cjs":{const i=Es(e,t,a);let s="require(",n=")";i&&(s=`/*#__PURE__*/${i}(${s}`,n+=")");const[o,c]=l([],{functionReturn:!0,lineBreakIndent:null,name:null});return s=`Promise.resolve().then(${o}${s}`,n+=`${c})`,!r&&d&&(s=h(["t"],`${s}t${n}`,{needsArrowReturnParens:!1,needsWrappedFunction:!0}),n=")"),{helper:i,mechanism:{left:s,right:n}}}case"amd":{const s=i?"c":"resolve",n=i?"e":"reject",c=Es(e,t,a),[u,p]=l(["m"],{functionReturn:!1,lineBreakIndent:null,name:null}),f=c?`${u}${s}(/*#__PURE__*/${c}(m))${p}`:s,[m,g]=l([s,n],{functionReturn:!1,lineBreakIndent:null,name:null});let y=`new Promise(${m}require([`,x=`],${o}${f},${o}${n})${g})`;return !r&&d&&(y=h(["t"],`${y}t${x}`,{needsArrowReturnParens:!1,needsWrappedFunction:!0}),x=")"),{helper:c,mechanism:{left:y,right:x}}}case"system":return {helper:null,mechanism:{left:"module.import(",right:")"}};case"es":if(s)return {helper:null,mechanism:{left:`${s}(`,right:")"}}}return {helper:null,mechanism:null}}},ImportNamespaceSpecifier:class extends ut{applyDeoptimizations(){}},ImportSpecifier:class extends ut{applyDeoptimizations(){}},LabeledStatement:class extends ut{hasEffects(e){const t=e.brokenFlow;return e.ignore.labels.add(this.label.name),!!this.body.hasEffects(e)||(e.ignore.labels.delete(this.label.name),e.includedLabels.has(this.label.name)&&(e.includedLabels.delete(this.label.name),e.brokenFlow=t),!1)}include(e,t){this.included=!0;const i=e.brokenFlow;this.body.include(e,t),(t||e.includedLabels.has(this.label.name))&&(this.label.include(),e.includedLabels.delete(this.label.name),e.brokenFlow=i);}render(e,t){this.label.included?this.label.render(e,t):e.remove(this.start,ui(e.original,hi(e.original,":",this.label.end)+1)),this.body.render(e,t);}},Literal:Ti,LogicalExpression:class extends ut{constructor(){super(...arguments),this.expressionsToBeDeoptimized=[],this.isBranchResolutionAnalysed=!1,this.usedBranch=null;}deoptimizeCache(){if(this.usedBranch){const e=this.usedBranch===this.left?this.right:this.left;this.usedBranch=null,e.deoptimizePath(B);for(const e of this.expressionsToBeDeoptimized)e.deoptimizeCache();this.context.requestTreeshakingPass();}}deoptimizePath(e){const t=this.getUsedBranch();t?t.deoptimizePath(e):(this.left.deoptimizePath(e),this.right.deoptimizePath(e));}deoptimizeThisOnInteractionAtPath(e,t,i){this.left.deoptimizeThisOnInteractionAtPath(e,t,i),this.right.deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){const s=this.getUsedBranch();return s?(this.expressionsToBeDeoptimized.push(i),s.getLiteralValueAtPath(e,t,i)):W}getReturnExpressionWhenCalledAtPath(e,t,i,s){const n=this.getUsedBranch();return n?(this.expressionsToBeDeoptimized.push(s),n.getReturnExpressionWhenCalledAtPath(e,t,i,s)):new Hi([this.left.getReturnExpressionWhenCalledAtPath(e,t,i,s),this.right.getReturnExpressionWhenCalledAtPath(e,t,i,s)])}hasEffects(e){return !!this.left.hasEffects(e)||this.getUsedBranch()!==this.left&&this.right.hasEffects(e)}hasEffectsOnInteractionAtPath(e,t,i){const s=this.getUsedBranch();return s?s.hasEffectsOnInteractionAtPath(e,t,i):this.left.hasEffectsOnInteractionAtPath(e,t,i)||this.right.hasEffectsOnInteractionAtPath(e,t,i)}include(e,t){this.included=!0;const i=this.getUsedBranch();t||i===this.right&&this.left.shouldBeIncluded(e)||!i?(this.left.include(e,t),this.right.include(e,t)):i.include(e,t);}render(e,t,{isCalleeOfRenderedParent:i,preventASI:s,renderedParentType:n,renderedSurroundingElement:r}=ie){if(this.left.included&&this.right.included)this.left.render(e,t,{preventASI:s,renderedSurroundingElement:r}),this.right.render(e,t);else {const a=hi(e.original,this.operator,this.left.end);if(this.right.included){const t=ui(e.original,a+2);e.remove(this.start,t),s&&mi(e,t,this.right.start);}else e.remove(a,this.end);oi(this,e),this.getUsedBranch().render(e,t,{isCalleeOfRenderedParent:i,preventASI:s,renderedParentType:n||this.parent.type,renderedSurroundingElement:r||this.parent.type});}}getUsedBranch(){if(!this.isBranchResolutionAnalysed){this.isBranchResolutionAnalysed=!0;const e=this.left.getLiteralValueAtPath(V,G,this);if("symbol"==typeof e)return null;this.usedBranch="||"===this.operator&&e||"&&"===this.operator&&!e||"??"===this.operator&&null!=e?this.left:this.right;}return this.usedBranch}},MemberExpression:Mi,MetaProperty:class extends ut{addAccessedGlobals(e,t){const i=this.metaProperty,s=(i&&(i.startsWith(Ss)||i.startsWith(vs)||i.startsWith("ROLLUP_CHUNK_URL_"))?Is:As)[e];s.length>0&&this.scope.addAccessedGlobals(s,t);}getReferencedFileName(e){const t=this.metaProperty;return t&&t.startsWith(Ss)?e.getFileName(t.substring(Ss.length)):null}hasEffects(){return !1}hasEffectsOnInteractionAtPath(e,{type:t}){return e.length>1||0!==t}include(){if(!this.included&&(this.included=!0,"import"===this.meta.name)){this.context.addImportMeta(this);const e=this.parent;this.metaProperty=e instanceof Mi&&"string"==typeof e.propertyKey?e.propertyKey:null;}}renderFinalMechanism(e,t,i,s,n){var r;const a=this.parent,o=this.metaProperty;if(o&&(o.startsWith(Ss)||o.startsWith(vs)||o.startsWith("ROLLUP_CHUNK_URL_"))){let s,r=null,l=null,h=null;o.startsWith(Ss)?(r=o.substring(Ss.length),s=n.getFileName(r)):o.startsWith(vs)?(ke(`Using the "${vs}" prefix to reference files is deprecated. Use the "${Ss}" prefix instead.`,!0,this.context.options),l=o.substring(vs.length),s=n.getFileName(l)):(ke(`Using the "ROLLUP_CHUNK_URL_" prefix to reference files is deprecated. Use the "${Ss}" prefix instead.`,!0,this.context.options),h=o.substring("ROLLUP_CHUNK_URL_".length),s=n.getFileName(h));const c=C(T(N(t),s));let u;return null!==l&&(u=n.hookFirstSync("resolveAssetUrl",[{assetFileName:s,chunkId:t,format:i,moduleId:this.context.module.id,relativeAssetPath:c}])),u||(u=n.hookFirstSync("resolveFileUrl",[{assetReferenceId:l,chunkId:t,chunkReferenceId:h,fileName:s,format:i,moduleId:this.context.module.id,referenceId:r||l||h,relativePath:c}])||_s[i](c)),void e.overwrite(a.start,a.end,u,{contentOnly:!0})}const l=n.hookFirstSync("resolveImportMeta",[o,{chunkId:t,format:i,moduleId:this.context.module.id}])||(null===(r=Ns[i])||void 0===r?void 0:r.call(Ns,o,{chunkId:t,snippets:s}));"string"==typeof l&&(a instanceof Mi?e.overwrite(a.start,a.end,l,{contentOnly:!0}):e.overwrite(this.start,this.end,l,{contentOnly:!0}));}},MethodDefinition:zi,NewExpression:class extends ut{hasEffects(e){try{for(const t of this.arguments)if(t.hasEffects(e))return !0;return (!this.context.options.treeshake.annotations||!this.annotations)&&(this.callee.hasEffects(e)||this.callee.hasEffectsOnInteractionAtPath(V,this.interaction,e))}finally{this.deoptimized||this.applyDeoptimizations();}}hasEffectsOnInteractionAtPath(e,{type:t}){return e.length>0||0!==t}include(e,t){this.deoptimized||this.applyDeoptimizations(),t?super.include(e,t):(this.included=!0,this.callee.include(e,!1)),this.callee.includeCallArguments(e,this.arguments);}initialise(){this.interaction={args:this.arguments,thisArg:null,type:2,withNew:!0};}render(e,t){this.callee.render(e,t),$i(e,t,this);}applyDeoptimizations(){this.deoptimized=!0;for(const e of this.arguments)e.deoptimizePath(B);this.context.requestTreeshakingPass();}},ObjectExpression:class extends ut{constructor(){super(...arguments),this.objectEntity=null;}deoptimizeCache(){this.getObjectEntity().deoptimizeAllProperties();}deoptimizePath(e){this.getObjectEntity().deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){this.getObjectEntity().deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){return this.getObjectEntity().getLiteralValueAtPath(e,t,i)}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.getObjectEntity().getReturnExpressionWhenCalledAtPath(e,t,i,s)}hasEffectsOnInteractionAtPath(e,t,i){return this.getObjectEntity().hasEffectsOnInteractionAtPath(e,t,i)}render(e,t,{renderedSurroundingElement:i}=ie){super.render(e,t),"ExpressionStatement"!==i&&"ArrowFunctionExpression"!==i||(e.appendRight(this.start,"("),e.prependLeft(this.end,")"));}applyDeoptimizations(){}getObjectEntity(){if(null!==this.objectEntity)return this.objectEntity;let e=St;const t=[];for(const i of this.properties){if(i instanceof dt){t.push({key:M,kind:"init",property:i});continue}let s;if(i.computed){const e=i.key.getLiteralValueAtPath(V,G,this);if("symbol"==typeof e){t.push({key:M,kind:i.kind,property:i});continue}s=String(e);}else if(s=i.key instanceof ni?i.key.name:String(i.key.value),"__proto__"===s&&"init"===i.kind){e=i.value instanceof Ti&&null===i.value.value?null:i.value;continue}t.push({key:s,kind:i.kind,property:i});}return this.objectEntity=new Et(t,e)}},ObjectPattern:ki,PrivateIdentifier:class extends ut{},Program:$s,Property:class extends Fi{constructor(){super(...arguments),this.declarationInit=null;}declare(e,t){return this.declarationInit=t,this.value.declare(e,X)}hasEffects(e){this.deoptimized||this.applyDeoptimizations();const t=this.context.options.treeshake.propertyReadSideEffects;return "ObjectPattern"===this.parent.type&&"always"===t||this.key.hasEffects(e)||this.value.hasEffects(e)}markDeclarationReached(){this.value.markDeclarationReached();}render(e,t){this.shorthand||this.key.render(e,t),this.value.render(e,t,{isShorthandProperty:this.shorthand});}applyDeoptimizations(){this.deoptimized=!0,null!==this.declarationInit&&(this.declarationInit.deoptimizePath([M,M]),this.context.requestTreeshakingPass());}},PropertyDefinition:class extends ut{deoptimizePath(e){var t;null===(t=this.value)||void 0===t||t.deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){var s;null===(s=this.value)||void 0===s||s.deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){return this.value?this.value.getLiteralValueAtPath(e,t,i):W}getReturnExpressionWhenCalledAtPath(e,t,i,s){return this.value?this.value.getReturnExpressionWhenCalledAtPath(e,t,i,s):X}hasEffects(e){var t;return this.key.hasEffects(e)||this.static&&!!(null===(t=this.value)||void 0===t?void 0:t.hasEffects(e))}hasEffectsOnInteractionAtPath(e,t,i){return !this.value||this.value.hasEffectsOnInteractionAtPath(e,t,i)}applyDeoptimizations(){}},RestElement:Ei,ReturnStatement:class extends ut{hasEffects(e){var t;return !(e.ignore.returnYield&&!(null===(t=this.argument)||void 0===t?void 0:t.hasEffects(e)))||(e.brokenFlow=2,!1)}include(e,t){var i;this.included=!0,null===(i=this.argument)||void 0===i||i.include(e,t),e.brokenFlow=2;}initialise(){this.scope.addReturnExpression(this.argument||X);}render(e,t){this.argument&&(this.argument.render(e,t,{preventASI:!0}),this.argument.start===this.start+6&&e.prependLeft(this.start+6," "));}},SequenceExpression:class extends ut{deoptimizePath(e){this.expressions[this.expressions.length-1].deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){this.expressions[this.expressions.length-1].deoptimizeThisOnInteractionAtPath(e,t,i);}getLiteralValueAtPath(e,t,i){return this.expressions[this.expressions.length-1].getLiteralValueAtPath(e,t,i)}hasEffects(e){for(const t of this.expressions)if(t.hasEffects(e))return !0;return !1}hasEffectsOnInteractionAtPath(e,t,i){return this.expressions[this.expressions.length-1].hasEffectsOnInteractionAtPath(e,t,i)}include(e,t){this.included=!0;const i=this.expressions[this.expressions.length-1];for(const s of this.expressions)(t||s===i&&!(this.parent instanceof yi)||s.shouldBeIncluded(e))&&s.include(e,t);}render(e,t,{renderedParentType:i,isCalleeOfRenderedParent:s,preventASI:n}=ie){let r=0,a=null;const o=this.expressions[this.expressions.length-1];for(const{node:l,separator:h,start:c,end:u}of fi(this.expressions,e,this.start,this.end))if(l.included)if(r++,a=h,1===r&&n&&mi(e,c,l.start),1===r){const n=i||this.parent.type;l.render(e,t,{isCalleeOfRenderedParent:s&&l===o,renderedParentType:n,renderedSurroundingElement:n});}else l.render(e,t);else ai(l,e,c,u);a&&e.remove(a,this.end);}},SpreadElement:dt,StaticBlock:class extends ut{createScope(e){this.scope=new gi(e);}hasEffects(e){for(const t of this.body)if(t.hasEffects(e))return !0;return !1}include(e,t){this.included=!0;for(const i of this.body)(t||i.shouldBeIncluded(e))&&i.include(e,t);}render(e,t){this.body.length?pi(this.body,e,this.start+1,this.end-1,t):super.render(e,t);}},Super:class extends ut{bind(){this.variable=this.scope.findVariable("this");}deoptimizePath(e){this.variable.deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){this.variable.deoptimizeThisOnInteractionAtPath(e,t,i);}include(){this.included||(this.included=!0,this.context.includeVariableInModule(this.variable));}},SwitchCase:Ts,SwitchStatement:class extends ut{createScope(e){this.scope=new gi(e);}hasEffects(e){if(this.discriminant.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:i}}=e;let s=1/0;e.ignore.breaks=!0;for(const i of this.cases){if(i.hasEffects(e))return !0;s=e.brokenFlow<s?e.brokenFlow:s,e.brokenFlow=t;}return null!==this.defaultCase&&1!==s&&(e.brokenFlow=s),e.ignore.breaks=i,!1}include(e,t){this.included=!0,this.discriminant.include(e,t);const{brokenFlow:i}=e;let s=1/0,n=t||null!==this.defaultCase&&this.defaultCase<this.cases.length-1;for(let r=this.cases.length-1;r>=0;r--){const a=this.cases[r];if(a.included&&(n=!0),!n){const e=Me();e.ignore.breaks=!0,n=a.hasEffects(e);}n?(a.include(e,t),s=s<e.brokenFlow?s:e.brokenFlow,e.brokenFlow=i):s=i;}n&&null!==this.defaultCase&&1!==s&&(e.brokenFlow=s);}initialise(){for(let e=0;e<this.cases.length;e++)if(null===this.cases[e].test)return void(this.defaultCase=e);this.defaultCase=null;}render(e,t){this.discriminant.render(e,t),this.cases.length>0&&pi(this.cases,e,this.cases[0].start,this.end-1,t);}},TaggedTemplateExpression:class extends Li{bind(){if(super.bind(),"Identifier"===this.tag.type){const e=this.tag.name;this.scope.findVariable(e).isNamespace&&this.context.warn({code:"CANNOT_CALL_NAMESPACE",message:`Cannot call a namespace ('${e}')`},this.start);}}hasEffects(e){try{for(const t of this.quasi.expressions)if(t.hasEffects(e))return !0;return this.tag.hasEffects(e)||this.tag.hasEffectsOnInteractionAtPath(V,this.interaction,e)}finally{this.deoptimized||this.applyDeoptimizations();}}include(e,t){this.deoptimized||this.applyDeoptimizations(),t?super.include(e,t):(this.included=!0,this.tag.include(e,t),this.quasi.include(e,t)),this.tag.includeCallArguments(e,this.interaction.args);const i=this.getReturnExpression();i.included||i.include(e,!1);}initialise(){this.interaction={args:[X,...this.quasi.expressions],thisArg:this.tag instanceof Mi&&!this.tag.variable?this.tag.object:null,type:2,withNew:!1};}render(e,t){this.tag.render(e,t,{isCalleeOfRenderedParent:!0}),this.quasi.render(e,t);}applyDeoptimizations(){this.deoptimized=!0,this.interaction.thisArg&&this.tag.deoptimizeThisOnInteractionAtPath(this.interaction,V,G);for(const e of this.quasi.expressions)e.deoptimizePath(B);this.context.requestTreeshakingPass();}getReturnExpression(e=G){return null===this.returnExpression?(this.returnExpression=X,this.returnExpression=this.tag.getReturnExpressionWhenCalledAtPath(V,this.interaction,e,this)):this.returnExpression}},TemplateElement:class extends ut{bind(){}hasEffects(){return !1}include(){this.included=!0;}parseNode(e){this.value=e.value,super.parseNode(e);}render(){}},TemplateLiteral:Os,ThisExpression:class extends ut{bind(){this.variable=this.scope.findVariable("this");}deoptimizePath(e){this.variable.deoptimizePath(e);}deoptimizeThisOnInteractionAtPath(e,t,i){this.variable.deoptimizeThisOnInteractionAtPath(e.thisArg===this?{...e,thisArg:this.variable}:e,t,i);}hasEffectsOnInteractionAtPath(e,t,i){return 0===e.length?0!==t.type:this.variable.hasEffectsOnInteractionAtPath(e,t,i)}include(){this.included||(this.included=!0,this.context.includeVariableInModule(this.variable));}initialise(){this.alias=this.scope.findLexicalBoundary()instanceof Ds?this.context.moduleContext:null,"undefined"===this.alias&&this.context.warn({code:"THIS_IS_UNDEFINED",message:"The 'this' keyword is equivalent to 'undefined' at the top level of an ES module, and has been rewritten",url:"https://rollupjs.org/guide/en/#error-this-is-undefined"},this.start);}render(e){null!==this.alias&&e.overwrite(this.start,this.end,this.alias,{contentOnly:!1,storeName:!0});}},ThrowStatement:class extends ut{hasEffects(){return !0}include(e,t){this.included=!0,this.argument.include(e,t),e.brokenFlow=2;}render(e,t){this.argument.render(e,t,{preventASI:!0}),this.argument.start===this.start+5&&e.prependLeft(this.start+5," ");}},TryStatement:class extends ut{constructor(){super(...arguments),this.directlyIncluded=!1,this.includedLabelsAfterBlock=null;}hasEffects(e){var t;return (this.context.options.treeshake.tryCatchDeoptimization?this.block.body.length>0:this.block.hasEffects(e))||!!(null===(t=this.finalizer)||void 0===t?void 0:t.hasEffects(e))}include(e,t){var i,s;const n=null===(i=this.context.options.treeshake)||void 0===i?void 0:i.tryCatchDeoptimization,{brokenFlow:r}=e;if(this.directlyIncluded&&n){if(this.includedLabelsAfterBlock)for(const t of this.includedLabelsAfterBlock)e.includedLabels.add(t);}else this.included=!0,this.directlyIncluded=!0,this.block.include(e,n?"variables":t),e.includedLabels.size>0&&(this.includedLabelsAfterBlock=[...e.includedLabels]),e.brokenFlow=r;null!==this.handler&&(this.handler.include(e,t),e.brokenFlow=r),null===(s=this.finalizer)||void 0===s||s.include(e,t);}},UnaryExpression:class extends ut{getLiteralValueAtPath(e,t,i){if(e.length>0)return W;const s=this.argument.getLiteralValueAtPath(V,t,i);return "symbol"==typeof s?W:Ls[this.operator](s)}hasEffects(e){return this.deoptimized||this.applyDeoptimizations(),!("typeof"===this.operator&&this.argument instanceof ni)&&(this.argument.hasEffects(e)||"delete"===this.operator&&this.argument.hasEffectsOnInteractionAtPath(V,Q,e))}hasEffectsOnInteractionAtPath(e,{type:t}){return 0!==t||e.length>("void"===this.operator?0:1)}applyDeoptimizations(){this.deoptimized=!0,"delete"===this.operator&&(this.argument.deoptimizePath(V),this.context.requestTreeshakingPass());}},UnknownNode:class extends ut{hasEffects(){return !0}include(e){super.include(e,!0);}},UpdateExpression:class extends ut{hasEffects(e){return this.deoptimized||this.applyDeoptimizations(),this.argument.hasEffectsAsAssignmentTarget(e,!0)}hasEffectsOnInteractionAtPath(e,{type:t}){return e.length>1||0!==t}include(e,t){this.deoptimized||this.applyDeoptimizations(),this.included=!0,this.argument.includeAsAssignmentTarget(e,t,!0);}initialise(){this.argument.setAssignedValue(X);}render(e,t){const{exportNamesByVariable:i,format:s,snippets:{_:n}}=t;if(this.argument.render(e,t),"system"===s){const s=this.argument.variable,r=i.get(s);if(r)if(this.prefix)1===r.length?Ai(s,this.start,this.end,e,t):Ii(s,this.start,this.end,"ExpressionStatement"!==this.parent.type,e,t);else {const i=this.operator[0];!function(e,t,i,s,n,r,a){const{_:o}=r.snippets;n.prependRight(t,`${Si([e],r,a)},${o}`),s&&(n.prependRight(t,"("),n.appendLeft(i,")"));}(s,this.start,this.end,"ExpressionStatement"!==this.parent.type,e,t,`${n}${i}${n}1`);}}}applyDeoptimizations(){if(this.deoptimized=!0,this.argument.deoptimizePath(V),this.argument instanceof ni){this.scope.findVariable(this.argument.name).isReassigned=!0;}this.context.requestTreeshakingPass();}},VariableDeclaration:Bs,VariableDeclarator:class extends ut{declareDeclarator(e){this.id.declare(e,this.init||Le);}deoptimizePath(e){this.id.deoptimizePath(e);}hasEffects(e){var t;const i=null===(t=this.init)||void 0===t?void 0:t.hasEffects(e);return this.id.markDeclarationReached(),i||this.id.hasEffects(e)}include(e,t){var i;this.included=!0,null===(i=this.init)||void 0===i||i.include(e,t),this.id.markDeclarationReached(),(t||this.id.shouldBeIncluded(e))&&this.id.include(e,t);}render(e,t){const{exportNamesByVariable:i,snippets:{_:s}}=t,n=this.id.included;if(n)this.id.render(e,t);else {const t=hi(e.original,"=",this.id.end);e.remove(this.start,ui(e.original,t+1));}this.init?this.init.render(e,t,n?ie:{renderedSurroundingElement:"ExpressionStatement"}):this.id instanceof ni&&Vs(this.id.variable,i)&&e.appendLeft(this.end,`${s}=${s}void 0`);}applyDeoptimizations(){}},WhileStatement:class extends ut{hasEffects(e){if(this.test.hasEffects(e))return !0;const{brokenFlow:t,ignore:{breaks:i,continues:s}}=e;return e.ignore.breaks=!0,e.ignore.continues=!0,!!this.body.hasEffects(e)||(e.ignore.breaks=i,e.ignore.continues=s,e.brokenFlow=t,!1)}include(e,t){this.included=!0,this.test.include(e,t);const{brokenFlow:i}=e;this.body.include(e,t,{asSingleStatement:!0}),e.brokenFlow=i;}},YieldExpression:class extends ut{hasEffects(e){var t;return this.deoptimized||this.applyDeoptimizations(),!(e.ignore.returnYield&&!(null===(t=this.argument)||void 0===t?void 0:t.hasEffects(e)))}render(e,t){this.argument&&(this.argument.render(e,t,{preventASI:!0}),this.argument.start===this.start+5&&e.prependLeft(this.start+5," "));}}};class zs extends ee{constructor(e){super("_missingExportShim"),this.module=e;}include(){super.include(),this.module.needsExportShim=!0;}}class js extends ee{constructor(e){super(e.getModuleName()),this.memberVariables=null,this.mergedNamespaces=[],this.referencedEarly=!1,this.references=[],this.context=e,this.module=e.module;}addReference(e){this.references.push(e),this.name=e.name;}getMemberVariables(){if(this.memberVariables)return this.memberVariables;const e=Object.create(null);for(const t of this.context.getExports().concat(this.context.getReexports()))if("*"!==t[0]&&t!==this.module.info.syntheticNamedExports){const i=this.context.traceExport(t);i&&(e[t]=i);}return this.memberVariables=e}include(){this.included=!0,this.context.includeAllExports();}prepare(e){this.mergedNamespaces.length>0&&this.module.scope.addAccessedGlobals(["_mergeNamespaces"],e);}renderBlock(e){const{exportNamesByVariable:t,format:i,freeze:s,indent:n,namespaceToStringTag:r,snippets:{_:a,cnst:o,getObject:l,getPropertyAccess:h,n:c,s:u}}=e,d=this.getMemberVariables(),p=Object.entries(d).map((([e,t])=>this.referencedEarly||t.isReassigned?[null,`get ${e}${a}()${a}{${a}return ${t.getName(h)}${u}${a}}`]:[e,t.getName(h)]));p.unshift([null,`__proto__:${a}null`]);let f=l(p,{lineBreakIndent:{base:"",t:n}});if(this.mergedNamespaces.length>0){const e=this.mergedNamespaces.map((e=>e.getName(h)));f=`/*#__PURE__*/_mergeNamespaces(${f},${a}[${e.join(`,${a}`)}])`;}else r&&(f=`/*#__PURE__*/Object.defineProperty(${f},${a}Symbol.toStringTag,${a}${xs(l)})`),s&&(f=`/*#__PURE__*/Object.freeze(${f})`);return f=`${o} ${this.getName(h)}${a}=${a}${f};`,"system"===i&&t.has(this)&&(f+=`${c}${Si([this],e)};`),f}renderFirst(){return this.referencedEarly}setMergedNamespaces(e){this.mergedNamespaces=e;const t=this.context.getModuleExecIndex();for(const e of this.references)if(e.context.getModuleExecIndex()<=t){this.referencedEarly=!0;break}}}js.prototype.isNamespace=!0;class Us extends ee{constructor(e,t,i){super(t),this.baseVariable=null,this.context=e,this.module=e.module,this.syntheticNamespace=i;}getBaseVariable(){if(this.baseVariable)return this.baseVariable;let e=this.syntheticNamespace;for(;e instanceof Ms||e instanceof Us;){if(e instanceof Ms){const t=e.getOriginalVariable();if(t===e)break;e=t;}e instanceof Us&&(e=e.syntheticNamespace);}return this.baseVariable=e}getBaseVariableName(){return this.syntheticNamespace.getBaseVariableName()}getName(e){return `${this.syntheticNamespace.getName(e)}${e(this.name)}`}include(){this.included=!0,this.context.includeVariableInModule(this.syntheticNamespace);}setRenderNames(e,t){super.setRenderNames(e,t);}}var Gs;function Hs(e){return e.id}!function(e){e[e.LOAD_AND_PARSE=0]="LOAD_AND_PARSE",e[e.ANALYSE=1]="ANALYSE",e[e.GENERATE=2]="GENERATE";}(Gs||(Gs={}));var Ws="performance"in("undefined"!=typeof globalThis?globalThis:"undefined"!=typeof window?window:{})?performance:{now:()=>0},qs={memoryUsage:()=>({heapUsed:0})};const Ks=()=>{};let Xs=new Map;function Ys(e,t){switch(t){case 1:return `# ${e}`;case 2:return `## ${e}`;case 3:return e;default:return `${"  ".repeat(t-4)}- ${e}`}}function Qs(e,t=3){e=Ys(e,t);const i=qs.memoryUsage().heapUsed,s=Ws.now(),n=Xs.get(e);void 0===n?Xs.set(e,{memory:0,startMemory:i,startTime:s,time:0,totalMemory:0}):(n.startMemory=i,n.startTime=s);}function Zs(e,t=3){e=Ys(e,t);const i=Xs.get(e);if(void 0!==i){const e=qs.memoryUsage().heapUsed;i.memory+=e-i.startMemory,i.time+=Ws.now()-i.startTime,i.totalMemory=Math.max(i.totalMemory,e);}}function Js(){const e={};for(const[t,{memory:i,time:s,totalMemory:n}]of Xs)e[t]=[s,i,n];return e}let en=Ks,tn=Ks;const sn=["load","resolveDynamicImport","resolveId","transform"];function nn(e,t){for(const i of sn)if(i in e){let s=`plugin ${t}`;e.name&&(s+=` (${e.name})`),s+=` - ${i}`;const n=e[i];e[i]=function(...e){en(s,4);const t=n.apply(this,e);return tn(s,4),t&&"function"==typeof t.then?(en(`${s} (async)`,4),t.then((e=>(tn(`${s} (async)`,4),e)))):t};}return e}function rn(e){e.isExecuted=!0;const t=[e],i=new Set;for(const e of t)for(const s of [...e.dependencies,...e.implicitlyLoadedBefore])s instanceof $e||s.isExecuted||!s.info.moduleSideEffects&&!e.implicitlyLoadedBefore.has(s)||i.has(s.id)||(s.isExecuted=!0,i.add(s.id),t.push(s));}const an={identifier:null,localName:"_missingExportShim"};function on(e,t,i,s,n=new Map){const r=n.get(t);if(r){if(r.has(e))return s?[null]:pe((a=t,o=e.id,{code:me.CIRCULAR_REEXPORT,id:o,message:`"${a}" cannot be exported from ${he(o)} as it is a reexport that references itself.`}));r.add(e);}else n.set(t,new Set([e]));var a,o;return e.getVariableForExportName(t,{importerForSideEffects:i,isExportAllSearch:s,searchedNamesAndModules:n})}class ln{constructor(e,t,i,s,n,r,a){this.graph=e,this.id=t,this.options=i,this.alternativeReexportModules=new Map,this.chunkFileNames=new Set,this.chunkNames=[],this.cycles=new Set,this.dependencies=new Set,this.dynamicDependencies=new Set,this.dynamicImporters=[],this.dynamicImports=[],this.execIndex=1/0,this.implicitlyLoadedAfter=new Set,this.implicitlyLoadedBefore=new Set,this.importDescriptions=new Map,this.importMetas=[],this.importedFromNotTreeshaken=!1,this.importers=[],this.includedDynamicImporters=[],this.includedImports=new Set,this.isExecuted=!1,this.isUserDefinedEntryPoint=!1,this.needsExportShim=!1,this.sideEffectDependenciesByVariable=new Map,this.sources=new Set,this.usesTopLevelAwait=!1,this.allExportNames=null,this.ast=null,this.exportAllModules=[],this.exportAllSources=new Set,this.exportNamesByVariable=null,this.exportShimVariable=new zs(this),this.exports=new Map,this.namespaceReexportsByName=new Map,this.reexportDescriptions=new Map,this.relevantDependencies=null,this.syntheticExports=new Map,this.syntheticNamespace=null,this.transformDependencies=[],this.transitiveReexports=null,this.excludeFromSourcemap=/\0/.test(t),this.context=i.moduleContext(t),this.preserveSignature=this.options.preserveEntrySignatures;const o=this,{dynamicImports:l,dynamicImporters:h,implicitlyLoadedAfter:c,implicitlyLoadedBefore:u,importers:d,reexportDescriptions:p,sources:f}=this;this.info={ast:null,code:null,get dynamicallyImportedIdResolutions(){return l.map((({argument:e})=>"string"==typeof e&&o.resolvedIds[e])).filter(Boolean)},get dynamicallyImportedIds(){return l.map((({id:e})=>e)).filter((e=>null!=e))},get dynamicImporters(){return h.sort()},get hasDefaultExport(){return o.ast?o.exports.has("default")||p.has("default"):null},get hasModuleSideEffects(){return ke("Accessing ModuleInfo.hasModuleSideEffects from plugins is deprecated. Please use ModuleInfo.moduleSideEffects instead.",!1,i),this.moduleSideEffects},id:t,get implicitlyLoadedAfterOneOf(){return Array.from(c,Hs).sort()},get implicitlyLoadedBefore(){return Array.from(u,Hs).sort()},get importedIdResolutions(){return Array.from(f,(e=>o.resolvedIds[e])).filter(Boolean)},get importedIds(){return Array.from(f,(e=>{var t;return null===(t=o.resolvedIds[e])||void 0===t?void 0:t.id})).filter(Boolean)},get importers(){return d.sort()},isEntry:s,isExternal:!1,get isIncluded(){return e.phase!==Gs.GENERATE?null:o.isIncluded()},meta:{...a},moduleSideEffects:n,syntheticNamedExports:r},Object.defineProperty(this.info,"hasModuleSideEffects",{enumerable:!1});}basename(){const e=_(this.id),t=$(this.id);return Ne(t?e.slice(0,-t.length):e)}bindReferences(){this.ast.bind();}error(e,t){return this.addLocationToLogProps(e,t),pe(e)}getAllExportNames(){if(this.allExportNames)return this.allExportNames;this.allExportNames=new Set([...this.exports.keys(),...this.reexportDescriptions.keys()]);for(const e of this.exportAllModules)if(e instanceof $e)this.allExportNames.add(`*${e.id}`);else for(const t of e.getAllExportNames())"default"!==t&&this.allExportNames.add(t);return "string"==typeof this.info.syntheticNamedExports&&this.allExportNames.delete(this.info.syntheticNamedExports),this.allExportNames}getDependenciesToBeIncluded(){if(this.relevantDependencies)return this.relevantDependencies;this.relevantDependencies=new Set;const e=new Set,t=new Set,i=new Set(this.includedImports);if(this.info.isEntry||this.includedDynamicImporters.length>0||this.namespace.included||this.implicitlyLoadedAfter.size>0)for(const e of [...this.getReexports(),...this.getExports()]){const[t]=this.getVariableForExportName(e);t&&i.add(t);}for(let s of i){const i=this.sideEffectDependenciesByVariable.get(s);if(i)for(const e of i)t.add(e);s instanceof Us?s=s.getBaseVariable():s instanceof Ms&&(s=s.getOriginalVariable()),e.add(s.module);}if(this.options.treeshake&&"no-treeshake"!==this.info.moduleSideEffects)this.addRelevantSideEffectDependencies(this.relevantDependencies,e,t);else for(const e of this.dependencies)this.relevantDependencies.add(e);for(const t of e)this.relevantDependencies.add(t);return this.relevantDependencies}getExportNamesByVariable(){if(this.exportNamesByVariable)return this.exportNamesByVariable;const e=new Map;for(const t of this.getAllExportNames()){let[i]=this.getVariableForExportName(t);if(i instanceof Ms&&(i=i.getOriginalVariable()),!i||!(i.included||i instanceof te))continue;const s=e.get(i);s?s.push(t):e.set(i,[t]);}return this.exportNamesByVariable=e}getExports(){return Array.from(this.exports.keys())}getReexports(){if(this.transitiveReexports)return this.transitiveReexports;this.transitiveReexports=[];const e=new Set(this.reexportDescriptions.keys());for(const t of this.exportAllModules)if(t instanceof $e)e.add(`*${t.id}`);else for(const i of [...t.getReexports(),...t.getExports()])"default"!==i&&e.add(i);return this.transitiveReexports=[...e]}getRenderedExports(){const e=[],t=[];for(const i of this.exports.keys()){const[s]=this.getVariableForExportName(i);(s&&s.included?e:t).push(i);}return {removedExports:t,renderedExports:e}}getSyntheticNamespace(){return null===this.syntheticNamespace&&(this.syntheticNamespace=void 0,[this.syntheticNamespace]=this.getVariableForExportName("string"==typeof this.info.syntheticNamedExports?this.info.syntheticNamedExports:"default",{onlyExplicit:!0})),this.syntheticNamespace?this.syntheticNamespace:pe((e=this.id,t=this.info.syntheticNamedExports,{code:me.SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT,id:e,message:`Module "${he(e)}" that is marked with 'syntheticNamedExports: ${JSON.stringify(t)}' needs ${"string"==typeof t&&"default"!==t?`an explicit export named "${t}"`:"a default export"} that does not reexport an unresolved named export of the same module.`}));var e,t;}getVariableForExportName(e,{importerForSideEffects:t,isExportAllSearch:i,onlyExplicit:s,searchedNamesAndModules:n}=se){var r;if("*"===e[0]){if(1===e.length)return [this.namespace];return this.graph.modulesById.get(e.slice(1)).getVariableForExportName("*")}const a=this.reexportDescriptions.get(e);if(a){const[e]=on(a.module,a.localName,t,!1,n);return e?(t&&hn(e,t,this),[e]):this.error(Ee(a.localName,this.id,a.module.id),a.start)}const o=this.exports.get(e);if(o){if(o===an)return [this.exportShimVariable];const e=o.localName,i=this.traceVariable(e,{importerForSideEffects:t,searchedNamesAndModules:n});return t&&(R(t.sideEffectDependenciesByVariable,i,(()=>new Set)).add(this),hn(i,t,this)),[i]}if(s)return [null];if("default"!==e){const i=null!==(r=this.namespaceReexportsByName.get(e))&&void 0!==r?r:this.getVariableFromNamespaceReexports(e,t,n);if(this.namespaceReexportsByName.set(e,i),i[0])return i}return this.info.syntheticNamedExports?[R(this.syntheticExports,e,(()=>new Us(this.astContext,e,this.getSyntheticNamespace())))]:!i&&this.options.shimMissingExports?(this.shimMissingExport(e),[this.exportShimVariable]):[null]}hasEffects(){return "no-treeshake"===this.info.moduleSideEffects||this.ast.included&&this.ast.hasEffects(Me())}include(){const e=Re();this.ast.shouldBeIncluded(e)&&this.ast.include(e,!1);}includeAllExports(e){this.isExecuted||(rn(this),this.graph.needsTreeshakingPass=!0);for(const t of this.exports.keys())if(e||t!==this.info.syntheticNamedExports){const e=this.getVariableForExportName(t)[0];e.deoptimizePath(B),e.included||this.includeVariable(e);}for(const e of this.getReexports()){const[t]=this.getVariableForExportName(e);t&&(t.deoptimizePath(B),t.included||this.includeVariable(t),t instanceof te&&(t.module.reexported=!0));}e&&this.namespace.setMergedNamespaces(this.includeAndGetAdditionalMergedNamespaces());}includeAllInBundle(){this.ast.include(Re(),!0),this.includeAllExports(!1);}isIncluded(){return this.ast.included||this.namespace.included||this.importedFromNotTreeshaken}linkImports(){this.addModulesToImportDescriptions(this.importDescriptions),this.addModulesToImportDescriptions(this.reexportDescriptions);const e=[];for(const t of this.exportAllSources){const i=this.graph.modulesById.get(this.resolvedIds[t].id);i instanceof $e?e.push(i):this.exportAllModules.push(i);}this.exportAllModules.push(...e);}render(e){const t=this.magicString.clone();return this.ast.render(t,e),this.usesTopLevelAwait=this.astContext.usesTopLevelAwait,t}setSource({ast:e,code:t,customTransformCache:i,originalCode:s,originalSourcemap:n,resolvedIds:r,sourcemapChain:a,transformDependencies:o,transformFiles:l,...h}){this.info.code=t,this.originalCode=s,this.originalSourcemap=n,this.sourcemapChain=a,l&&(this.transformFiles=l),this.transformDependencies=o,this.customTransformCache=i,this.updateOptions(h),en("generate ast",3),e||(e=this.tryParse()),tn("generate ast",3),this.resolvedIds=r||Object.create(null);const c=this.id;this.magicString=new x(t,{filename:this.excludeFromSourcemap?null:c,indentExclusionRanges:[]}),en("analyse ast",3),this.astContext={addDynamicImport:this.addDynamicImport.bind(this),addExport:this.addExport.bind(this),addImport:this.addImport.bind(this),addImportMeta:this.addImportMeta.bind(this),code:t,deoptimizationTracker:this.graph.deoptimizationTracker,error:this.error.bind(this),fileName:c,getExports:this.getExports.bind(this),getModuleExecIndex:()=>this.execIndex,getModuleName:this.basename.bind(this),getNodeConstructor:e=>Fs[e]||Fs.UnknownNode,getReexports:this.getReexports.bind(this),importDescriptions:this.importDescriptions,includeAllExports:()=>this.includeAllExports(!0),includeDynamicImport:this.includeDynamicImport.bind(this),includeVariableInModule:this.includeVariableInModule.bind(this),magicString:this.magicString,module:this,moduleContext:this.context,options:this.options,requestTreeshakingPass:()=>this.graph.needsTreeshakingPass=!0,traceExport:e=>this.getVariableForExportName(e)[0],traceVariable:this.traceVariable.bind(this),usesTopLevelAwait:!1,warn:this.warn.bind(this)},this.scope=new Ds(this.graph.scope,this.astContext),this.namespace=new js(this.astContext),this.ast=new $s(e,{context:this.astContext,type:"Module"},this.scope),this.info.ast=e,tn("analyse ast",3);}toJSON(){return {ast:this.ast.esTreeNode,code:this.info.code,customTransformCache:this.customTransformCache,dependencies:Array.from(this.dependencies,Hs),id:this.id,meta:this.info.meta,moduleSideEffects:this.info.moduleSideEffects,originalCode:this.originalCode,originalSourcemap:this.originalSourcemap,resolvedIds:this.resolvedIds,sourcemapChain:this.sourcemapChain,syntheticNamedExports:this.info.syntheticNamedExports,transformDependencies:this.transformDependencies,transformFiles:this.transformFiles}}traceVariable(e,{importerForSideEffects:t,isExportAllSearch:i,searchedNamesAndModules:s}=se){const n=this.scope.variables.get(e);if(n)return n;const r=this.importDescriptions.get(e);if(r){const e=r.module;if(e instanceof ln&&"*"===r.name)return e.namespace;const[n]=on(e,r.name,t||this,i,s);return n||this.error(Ee(r.name,this.id,e.id),r.start)}return null}tryParse(){try{return this.graph.contextParse(this.info.code)}catch(e){let t=e.message.replace(/ \(\d+:\d+\)$/,"");return this.id.endsWith(".json")?t+=" (Note that you need @rollup/plugin-json to import JSON files)":this.id.endsWith(".js")||(t+=" (Note that you need plugins to import files that are not JavaScript)"),this.error({code:"PARSE_ERROR",message:t,parserError:e},e.pos)}}updateOptions({meta:e,moduleSideEffects:t,syntheticNamedExports:i}){null!=t&&(this.info.moduleSideEffects=t),null!=i&&(this.info.syntheticNamedExports=i),null!=e&&Object.assign(this.info.meta,e);}warn(e,t){this.addLocationToLogProps(e,t),this.options.onwarn(e);}addDynamicImport(e){let t=e.source;t instanceof Os?1===t.quasis.length&&t.quasis[0].value.cooked&&(t=t.quasis[0].value.cooked):t instanceof Ti&&"string"==typeof t.value&&(t=t.value),this.dynamicImports.push({argument:t,id:null,node:e,resolution:null});}addExport(e){if(e instanceof Ki)this.exports.set("default",{identifier:e.variable.getAssignedVariableName(),localName:"default"});else if(e instanceof Wi){const t=e.source.value;if(this.sources.add(t),e.exported){const i=e.exported.name;this.reexportDescriptions.set(i,{localName:"*",module:null,source:t,start:e.start});}else this.exportAllSources.add(t);}else if(e.source instanceof Ti){const t=e.source.value;this.sources.add(t);for(const i of e.specifiers){const e=i.exported.name;this.reexportDescriptions.set(e,{localName:i.local.name,module:null,source:t,start:i.start});}}else if(e.declaration){const t=e.declaration;if(t instanceof Bs)for(const e of t.declarations)for(const t of Oe(e.id))this.exports.set(t,{identifier:null,localName:t});else {const e=t.id.name;this.exports.set(e,{identifier:null,localName:e});}}else for(const t of e.specifiers){const e=t.local.name,i=t.exported.name;this.exports.set(i,{identifier:null,localName:e});}}addImport(e){const t=e.source.value;this.sources.add(t);for(const i of e.specifiers){const e="ImportDefaultSpecifier"===i.type,s="ImportNamespaceSpecifier"===i.type,n=e?"default":s?"*":i.imported.name;this.importDescriptions.set(i.local.name,{module:null,name:n,source:t,start:i.start});}}addImportMeta(e){this.importMetas.push(e);}addLocationToLogProps(e,t){e.id=this.id,e.pos=t;let i=this.info.code;const s=re(i,t,{offsetLine:1});if(s){let{column:n,line:r}=s;try{(({column:n,line:r}=function(e,t){const i=e.filter((e=>!!e.mappings));e:for(;i.length>0;){const e=i.pop().mappings[t.line-1];if(e){const i=e.filter((e=>e.length>1)),s=i[i.length-1];for(const e of i)if(e[0]>=t.column||e===s){t={column:e[3],line:e[2]+1};continue e}}throw new Error("Can't resolve original location of error.")}return t}(this.sourcemapChain,{column:n,line:r}))),i=this.originalCode;}catch(e){this.options.onwarn({code:"SOURCEMAP_ERROR",id:this.id,loc:{column:n,file:this.id,line:r},message:`Error when using sourcemap for reporting an error: ${e.message}`,pos:t});}fe(e,{column:n,line:r},i,this.id);}}addModulesToImportDescriptions(e){for(const t of e.values()){const{id:e}=this.resolvedIds[t.source];t.module=this.graph.modulesById.get(e);}}addRelevantSideEffectDependencies(e,t,i){const s=new Set,n=r=>{for(const a of r)s.has(a)||(s.add(a),t.has(a)?e.add(a):(a.info.moduleSideEffects||i.has(a))&&(a instanceof $e||a.hasEffects()?e.add(a):n(a.dependencies)));};n(this.dependencies),n(i);}getVariableFromNamespaceReexports(e,t,i){let s=null;const n=new Map,r=new Set;for(const a of this.exportAllModules){if(a.info.syntheticNamedExports===e)continue;const[o,l]=on(a,e,t,!0,cn(i));a instanceof $e||l?r.add(o):o instanceof Us?s||(s=o):o&&n.set(o,a);}if(n.size>0){const t=[...n],i=t[0][0];return 1===t.length?[i]:(this.options.onwarn(function(e,t,i){return {code:me.NAMESPACE_CONFLICT,message:`Conflicting namespaces: "${he(t)}" re-exports "${e}" from one of the modules ${oe(i.map((e=>he(e))))} (will be ignored)`,name:e,reexporter:t,sources:i}}(e,this.id,t.map((([,e])=>e.id)))),[null])}if(r.size>0){const t=[...r],i=t[0];return t.length>1&&this.options.onwarn(function(e,t,i,s){return {code:me.AMBIGUOUS_EXTERNAL_NAMESPACES,message:`Ambiguous external namespace resolution: "${he(t)}" re-exports "${e}" from one of the external modules ${oe(s.map((e=>he(e))))}, guessing "${he(i)}".`,name:e,reexporter:t,sources:s}}(e,this.id,i.module.id,t.map((e=>e.module.id)))),[i,!0]}return s?[s]:[null]}includeAndGetAdditionalMergedNamespaces(){const e=new Set,t=new Set;for(const i of [this,...this.exportAllModules])if(i instanceof $e){const[t]=i.getVariableForExportName("*");t.include(),this.includedImports.add(t),e.add(t);}else if(i.info.syntheticNamedExports){const e=i.getSyntheticNamespace();e.include(),this.includedImports.add(e),t.add(e);}return [...t,...e]}includeDynamicImport(e){const t=this.dynamicImports.find((t=>t.node===e)).resolution;t instanceof ln&&(t.includedDynamicImporters.push(this),t.includeAllExports(!0));}includeVariable(e){if(!e.included){e.include(),this.graph.needsTreeshakingPass=!0;const t=e.module;if(t instanceof ln&&(t.isExecuted||rn(t),t!==this)){const t=function(e,t){const i=R(t.sideEffectDependenciesByVariable,e,(()=>new Set));let s=e;const n=new Set([s]);for(;;){const e=s.module;if(s=s instanceof Ms?s.getDirectOriginalVariable():s instanceof Us?s.syntheticNamespace:null,!s||n.has(s))break;n.add(s),i.add(e);const t=e.sideEffectDependenciesByVariable.get(s);if(t)for(const e of t)i.add(e);}return i}(e,this);for(const e of t)e.isExecuted||rn(e);}}}includeVariableInModule(e){this.includeVariable(e);const t=e.module;t&&t!==this&&this.includedImports.add(e);}shimMissingExport(e){this.options.onwarn({code:"SHIMMED_EXPORT",exporter:he(this.id),exportName:e,message:`Missing export "${e}" has been shimmed in module ${he(this.id)}.`}),this.exports.set(e,an);}}function hn(e,t,i){if(e.module instanceof ln&&e.module!==i){const s=e.module.cycles;if(s.size>0){const n=i.cycles;for(const r of n)if(s.has(r)){t.alternativeReexportModules.set(e,i);break}}}}const cn=e=>e&&new Map(Array.from(e,(([e,t])=>[e,new Set(t)])));function un(e){return e.endsWith(".js")?e.slice(0,-3):e}function dn(e,t){return e.autoId?`${e.basePath?e.basePath+"/":""}${un(t)}`:e.id||""}function pn(e,t,i,s,n,r,a,o="return "){const{_:l,cnst:h,getDirectReturnFunction:c,getFunctionIntro:u,getPropertyAccess:d,n:p,s:f}=n;if(!i)return `${p}${p}${o}${function(e,t,i,s,n){if(e.length>0)return e[0].local;for(const{defaultVariableName:e,id:r,isChunk:a,name:o,namedExportsMode:l,namespaceVariableName:h,reexports:c}of t)if(c)return fn(o,c[0].imported,l,a,e,h,i,r,s,n)}(e,t,s,a,d)};`;let m="";for(const{defaultVariableName:e,id:n,isChunk:o,name:h,namedExportsMode:u,namespaceVariableName:f,reexports:g}of t)if(g&&i)for(const t of g)if("*"!==t.reexported){const i=fn(h,t.imported,u,o,e,f,s,n,a,d);if(m&&(m+=p),"*"!==t.imported&&t.needsLiveBinding){const[e,s]=c([],{functionReturn:!0,lineBreakIndent:null,name:null});m+=`Object.defineProperty(exports,${l}'${t.reexported}',${l}{${p}${r}enumerable:${l}true,${p}${r}get:${l}${e}${i}${s}${p}});`;}else m+=`exports${d(t.reexported)}${l}=${l}${i};`;}for(const{exported:t,local:i}of e){const e=`exports${d(t)}`,s=i;e!==s&&(m&&(m+=p),m+=`${e}${l}=${l}${s};`);}for(const{name:e,reexports:s}of t)if(s&&i)for(const t of s)if("*"===t.reexported){m&&(m+=p);const i=`{${p}${r}if${l}(k${l}!==${l}'default'${l}&&${l}!exports.hasOwnProperty(k))${l}${yn(e,t.needsLiveBinding,r,n)}${f}${p}}`;m+="var"===h&&t.needsLiveBinding?`Object.keys(${e}).forEach(${u(["k"],{isAsync:!1,name:null})}${i});`:`for${l}(${h} k in ${e})${l}${i}`;}return m?`${p}${p}${m}`:""}function fn(e,t,i,s,n,r,a,o,l,h){if("default"===t){if(!s){const t=String(a(o)),i=es[t]?n:e;return ts(t,l)?`${i}${h("default")}`:i}return i?`${e}${h("default")}`:e}return "*"===t?(s?!i:is[String(a(o))])?r:e:`${e}${h(t)}`}function mn(e){return e([["value","true"]],{lineBreakIndent:null})}function gn(e,t,i,{_:s,getObject:n}){if(e){if(t)return i?`Object.defineProperties(exports,${s}${n([["__esModule",mn(n)],[null,`[Symbol.toStringTag]:${s}${xs(n)}`]],{lineBreakIndent:null})});`:`Object.defineProperty(exports,${s}'__esModule',${s}${mn(n)});`;if(i)return `Object.defineProperty(exports,${s}Symbol.toStringTag,${s}${xs(n)});`}return ""}const yn=(e,t,i,{_:s,getDirectReturnFunction:n,n:r})=>{if(t){const[t,a]=n([],{functionReturn:!0,lineBreakIndent:null,name:null});return `Object.defineProperty(exports,${s}k,${s}{${r}${i}${i}enumerable:${s}true,${r}${i}${i}get:${s}${t}${e}[k]${a}${r}${i}})`}return `exports[k]${s}=${s}${e}[k]`};function xn(e,t,i,s,n,r,a,o){const{_:l,cnst:h,n:c}=o,u=new Set,d=[],p=(e,t,i)=>{u.add(t),d.push(`${h} ${e}${l}=${l}/*#__PURE__*/${t}(${i});`);};for(const{defaultVariableName:i,imports:s,id:n,isChunk:r,name:a,namedExportsMode:o,namespaceVariableName:l,reexports:h}of e)if(r){for(const{imported:e,reexported:t}of [...s||[],...h||[]])if("*"===e&&"*"!==t){o||p(l,"_interopNamespaceDefaultOnly",a);break}}else {const e=String(t(n));let r=!1,o=!1;for(const{imported:t,reexported:n}of [...s||[],...h||[]]){let s,h;"default"===t?r||(r=!0,i!==l&&(h=i,s=es[e])):"*"===t&&"*"!==n&&(o||(o=!0,s=is[e],h=l)),s&&p(h,s,a);}}return `${ns(u,r,a,o,i,s,n)}${d.length>0?`${d.join(c)}${c}${c}`:""}`}function En(e){return "."===e[0]?un(e):e}const bn={assert:!0,buffer:!0,console:!0,constants:!0,domain:!0,events:!0,http:!0,https:!0,os:!0,path:!0,process:!0,punycode:!0,querystring:!0,stream:!0,string_decoder:!0,timers:!0,tty:!0,url:!0,util:!0,vm:!0,zlib:!0};function vn(e,t){const i=t.map((({id:e})=>e)).filter((e=>e in bn));i.length&&e({code:"MISSING_NODE_BUILTINS",message:`Creating a browser bundle that depends on Node.js built-in modules (${oe(i)}). You might need to include https://github.com/FredKSchott/rollup-plugin-polyfill-node`,modules:i});}const Sn=(e,t)=>e.split(".").map(t).join("");function An(e,t,i,s,{_:n,getPropertyAccess:r}){const a=e.split(".");a[0]=("function"==typeof i?i(a[0]):i[a[0]])||a[0];const o=a.pop();let l=t,h=a.map((e=>(l+=r(e),`${l}${n}=${n}${l}${n}||${n}{}`))).concat(`${l}${r(o)}`).join(`,${n}`)+`${n}=${n}${s}`;return a.length>0&&(h=`(${h})`),h}function In(e){let t=e.length;for(;t--;){const{imports:i,reexports:s}=e[t];if(i||s)return e.slice(0,t+1)}return []}const kn=({dependencies:e,exports:t})=>{const i=new Set(t.map((e=>e.exported)));i.add("default");for(const{reexports:t}of e)if(t)for(const e of t)"*"!==e.reexported&&i.add(e.reexported);return i},Pn=(e,t,{_:i,cnst:s,getObject:n,n:r})=>e?`${r}${t}${s} _starExcludes${i}=${i}${n([...e].map((e=>[e,"1"])),{lineBreakIndent:{base:t,t:t}})};`:"",wn=(e,t,{_:i,n:s})=>e.length?`${s}${t}var ${e.join(`,${i}`)};`:"",Cn=(e,t,i)=>_n(e.filter((e=>e.hoisted)).map((e=>({name:e.exported,value:e.local}))),t,i);function _n(e,t,{_:i,n:s}){return 0===e.length?"":1===e.length?`exports('${e[0].name}',${i}${e[0].value});${s}${s}`:`exports({${s}`+e.map((({name:e,value:s})=>`${t}${e}:${i}${s}`)).join(`,${s}`)+`${s}});${s}${s}`}const Nn=(e,t,i)=>_n(e.filter((e=>e.expression)).map((e=>({name:e.exported,value:e.local}))),t,i),$n=(e,t,i)=>_n(e.filter((e=>"_missingExportShim"===e.local)).map((e=>({name:e.exported,value:"_missingExportShim"}))),t,i);function Tn(e,t,i){return e?`${t}${Sn(e,i)}`:"null"}var On={amd:function(e,{accessedGlobals:t,dependencies:i,exports:s,hasExports:n,id:r,indent:a,intro:o,isEntryFacade:l,isModuleFacade:h,namedExportsMode:c,outro:u,snippets:d,warn:p},{amd:f,esModule:m,externalLiveBindings:g,freeze:y,interop:x,namespaceToStringTag:E,strict:b}){vn(p,i);const v=i.map((e=>`'${En(e.id)}'`)),S=i.map((e=>e.name)),{n:A,getNonArrowFunctionIntro:I,_:k}=d;c&&n&&(S.unshift("exports"),v.unshift("'exports'")),t.has("require")&&(S.unshift("require"),v.unshift("'require'")),t.has("module")&&(S.unshift("module"),v.unshift("'module'"));const P=dn(f,r),w=(P?`'${P}',${k}`:"")+(v.length?`[${v.join(`,${k}`)}],${k}`:""),C=b?`${k}'use strict';`:"";e.prepend(`${o}${xn(i,x,g,y,E,t,a,d)}`);const _=pn(s,i,c,x,d,a,g);let N=gn(c&&n,l&&m,h&&E,d);return N&&(N=A+A+N),e.append(`${_}${N}${u}`),e.indent(a).prepend(`${f.define}(${w}(${I(S,{isAsync:!1,name:null})}{${C}${A}${A}`).append(`${A}${A}}));`)},cjs:function(e,{accessedGlobals:t,dependencies:i,exports:s,hasExports:n,indent:r,intro:a,isEntryFacade:o,isModuleFacade:l,namedExportsMode:h,outro:c,snippets:u},{compact:d,esModule:p,externalLiveBindings:f,freeze:m,interop:g,namespaceToStringTag:y,strict:x}){const{_:E,n:b}=u,v=x?`'use strict';${b}${b}`:"";let S=gn(h&&n,o&&p,l&&y,u);S&&(S+=b+b);const A=function(e,{_:t,cnst:i,n:s},n){let r="",a=!1;for(const{id:o,name:l,reexports:h,imports:c}of e)h||c?(r+=n&&a?",":`${r?`;${s}`:""}${i} `,a=!0,r+=`${l}${t}=${t}require('${o}')`):(r&&(r+=n&&!a?",":`;${s}`),a=!1,r+=`require('${o}')`);if(r)return `${r};${s}${s}`;return ""}(i,u,d),I=xn(i,g,f,m,y,t,r,u);e.prepend(`${v}${a}${S}${A}${I}`);const k=pn(s,i,h,g,u,r,f,`module.exports${E}=${E}`);return e.append(`${k}${c}`)},es:function(e,{accessedGlobals:t,indent:i,intro:s,outro:n,dependencies:r,exports:a,snippets:o},{externalLiveBindings:l,freeze:h,namespaceToStringTag:c}){const{_:u,n:d}=o,p=function(e,t){const i=[];for(const{id:s,reexports:n,imports:r,name:a}of e)if(n||r){if(r){let e=null,n=null;const a=[];for(const t of r)"default"===t.imported?e=t:"*"===t.imported?n=t:a.push(t);n&&i.push(`import${t}*${t}as ${n.local} from${t}'${s}';`),e&&0===a.length?i.push(`import ${e.local} from${t}'${s}';`):a.length>0&&i.push(`import ${e?`${e.local},${t}`:""}{${t}${a.map((e=>e.imported===e.local?e.imported:`${e.imported} as ${e.local}`)).join(`,${t}`)}${t}}${t}from${t}'${s}';`);}if(n){let e=null;const o=[],l=[];for(const t of n)"*"===t.reexported?e=t:"*"===t.imported?o.push(t):l.push(t);if(e&&i.push(`export${t}*${t}from${t}'${s}';`),o.length>0){r&&r.some((e=>"*"===e.imported&&e.local===a))||i.push(`import${t}*${t}as ${a} from${t}'${s}';`);for(const e of o)i.push(`export${t}{${t}${a===e.reexported?a:`${a} as ${e.reexported}`} };`);}l.length>0&&i.push(`export${t}{${t}${l.map((e=>e.imported===e.reexported?e.imported:`${e.imported} as ${e.reexported}`)).join(`,${t}`)}${t}}${t}from${t}'${s}';`);}}else i.push(`import${t}'${s}';`);return i}(r,u);p.length>0&&(s+=p.join(d)+d+d),(s+=ns(null,t,i,o,l,h,c))&&e.prepend(s);const f=function(e,{_:t,cnst:i}){const s=[],n=[];for(const r of e)r.expression&&s.push(`${i} ${r.local}${t}=${t}${r.expression};`),n.push(r.exported===r.local?r.local:`${r.local} as ${r.exported}`);n.length&&s.push(`export${t}{${t}${n.join(`,${t}`)}${t}};`);return s}(a,o);return f.length&&e.append(d+d+f.join(d).trim()),n&&e.append(n),e.trim()},iife:function(e,{accessedGlobals:t,dependencies:i,exports:s,hasExports:n,indent:r,intro:a,namedExportsMode:o,outro:l,snippets:h,warn:c},{compact:u,esModule:d,extend:p,freeze:f,externalLiveBindings:m,globals:g,interop:y,name:x,namespaceToStringTag:E,strict:b}){const{_:v,cnst:S,getNonArrowFunctionIntro:A,getPropertyAccess:I,n:k}=h,P=x&&x.includes("."),w=!p&&!P;if(x&&w&&(_e(C=x)||we.has(C)||Ce.test(C)))return pe({code:"ILLEGAL_IDENTIFIER_AS_NAME",message:`Given name "${x}" is not a legal JS identifier. If you need this, you can try "output.extend: true".`});var C;vn(c,i);const _=In(i),N=_.map((e=>e.globalName||"null")),$=_.map((e=>e.name));n&&!x&&c({code:"MISSING_NAME_OPTION_FOR_IIFE_EXPORT",message:'If you do not supply "output.name", you may not be able to access the exports of an IIFE bundle.'}),o&&n&&(p?(N.unshift(`this${Sn(x,I)}${v}=${v}this${Sn(x,I)}${v}||${v}{}`),$.unshift("exports")):(N.unshift("{}"),$.unshift("exports")));const T=b?`${r}'use strict';${k}`:"",O=xn(i,y,m,f,E,t,r,h);e.prepend(`${a}${O}`);let R=`(${A($,{isAsync:!1,name:null})}{${k}${T}${k}`;n&&(!x||p&&o||(R=(w?`${S} ${x}`:`this${Sn(x,I)}`)+`${v}=${v}${R}`),P&&(R=function(e,t,i,{_:s,getPropertyAccess:n,s:r},a){const o=e.split(".");o[0]=("function"==typeof i?i(o[0]):i[o[0]])||o[0],o.pop();let l=t;return o.map((e=>(l+=n(e),`${l}${s}=${s}${l}${s}||${s}{}${r}`))).join(a?",":"\n")+(a&&o.length?";":"\n")}(x,"this",g,h,u)+R));let M=`${k}${k}})(${N.join(`,${v}`)});`;n&&!p&&o&&(M=`${k}${k}${r}return exports;${M}`);const D=pn(s,i,o,y,h,r,m);let L=gn(o&&n,d,E,h);return L&&(L=k+k+L),e.append(`${D}${L}${l}`),e.indent(r).prepend(R).append(M)},system:function(e,{accessedGlobals:t,dependencies:i,exports:s,hasExports:n,indent:r,intro:a,snippets:o,outro:l,usesTopLevelAwait:h},{externalLiveBindings:c,freeze:u,name:d,namespaceToStringTag:p,strict:f,systemNullSetters:m}){const{_:g,getFunctionIntro:y,getNonArrowFunctionIntro:x,n:E,s:b}=o,{importBindings:v,setters:S,starExcludes:A}=function(e,t,i,{_:s,cnst:n,getObject:r,getPropertyAccess:a,n:o}){const l=[],h=[];let c=null;for(const{imports:u,reexports:d}of e){const p=[];if(u)for(const e of u)l.push(e.local),"*"===e.imported?p.push(`${e.local}${s}=${s}module;`):p.push(`${e.local}${s}=${s}module${a(e.imported)};`);if(d){const o=[];let l=!1;for(const{imported:e,reexported:t}of d)"*"===t?l=!0:o.push([t,"*"===e?"module":`module${a(e)}`]);if(o.length>1||l){const a=r(o,{lineBreakIndent:null});l?(c||(c=kn({dependencies:e,exports:t})),p.push(`${n} setter${s}=${s}${a};`,`for${s}(${n} name in module)${s}{`,`${i}if${s}(!_starExcludes[name])${s}setter[name]${s}=${s}module[name];`,"}","exports(setter);")):p.push(`exports(${a});`);}else {const[e,t]=o[0];p.push(`exports('${e}',${s}${t});`);}}h.push(p.join(`${o}${i}${i}${i}`));}return {importBindings:l,setters:h,starExcludes:c}}(i,s,r,o),I=d?`'${d}',${g}`:"",k=t.has("module")?["exports","module"]:n?["exports"]:[];let P=`System.register(${I}[`+i.map((({id:e})=>`'${e}'`)).join(`,${g}`)+`],${g}(${x(k,{isAsync:!1,name:null})}{${E}${r}${f?"'use strict';":""}`+Pn(A,r,o)+wn(v,r,o)+`${E}${r}return${g}{${S.length?`${E}${r}${r}setters:${g}[${S.map((e=>e?`${y(["module"],{isAsync:!1,name:null})}{${E}${r}${r}${r}${e}${E}${r}${r}}`:m?"null":`${y([],{isAsync:!1,name:null})}{}`)).join(`,${g}`)}],`:""}${E}`;P+=`${r}${r}execute:${g}(${x([],{isAsync:h,name:null})}{${E}${E}`;const w=`${r}${r}})${E}${r}}${b}${E}}));`;return e.prepend(a+ns(null,t,r,o,c,u,p)+Cn(s,r,o)),e.append(`${l}${E}${E}`+Nn(s,r,o)+$n(s,r,o)),e.indent(`${r}${r}${r}`).append(w).prepend(P)},umd:function(e,{accessedGlobals:t,dependencies:i,exports:s,hasExports:n,id:r,indent:a,intro:o,namedExportsMode:l,outro:h,snippets:c,warn:u},{amd:d,compact:p,esModule:f,extend:m,externalLiveBindings:g,freeze:y,interop:x,name:E,namespaceToStringTag:b,globals:v,noConflict:S,strict:A}){const{_:I,cnst:k,getFunctionIntro:P,getNonArrowFunctionIntro:w,getPropertyAccess:C,n:_,s:N}=c,$=p?"f":"factory",T=p?"g":"global";if(n&&!E)return pe({code:"MISSING_NAME_OPTION_FOR_IIFE_EXPORT",message:'You must supply "output.name" for UMD bundles that have exports so that the exports are accessible in environments without a module loader.'});vn(u,i);const O=i.map((e=>`'${En(e.id)}'`)),R=i.map((e=>`require('${e.id}')`)),M=In(i),D=M.map((e=>Tn(e.globalName,T,C))),L=M.map((e=>e.name));l&&(n||S)&&(O.unshift("'exports'"),R.unshift("exports"),D.unshift(An(E,T,v,(m?`${Tn(E,T,C)}${I}||${I}`:"")+"{}",c)),L.unshift("exports"));const V=dn(d,r),B=(V?`'${V}',${I}`:"")+(O.length?`[${O.join(`,${I}`)}],${I}`:""),F=d.define,z=!l&&n?`module.exports${I}=${I}`:"",j=A?`${I}'use strict';${_}`:"";let U;if(S){const e=p?"e":"exports";let t;if(!l&&n)t=`${k} ${e}${I}=${I}${An(E,T,v,`${$}(${D.join(`,${I}`)})`,c)};`;else {t=`${k} ${e}${I}=${I}${D.shift()};${_}${a}${a}${$}(${[e].concat(D).join(`,${I}`)});`;}U=`(${P([],{isAsync:!1,name:null})}{${_}${a}${a}${k} current${I}=${I}${function(e,t,{_:i,getPropertyAccess:s}){let n=t;return e.split(".").map((e=>n+=s(e))).join(`${i}&&${i}`)}(E,T,c)};${_}${a}${a}${t}${_}${a}${a}${e}.noConflict${I}=${I}${P([],{isAsync:!1,name:null})}{${I}${Tn(E,T,C)}${I}=${I}current;${I}return ${e}${N}${I}};${_}${a}})()`;}else U=`${$}(${D.join(`,${I}`)})`,!l&&n&&(U=An(E,T,v,U,c));const G=n||S&&l||D.length>0,H=[$];G&&H.unshift(T);const W=G?`this,${I}`:"",q=G?`(${T}${I}=${I}typeof globalThis${I}!==${I}'undefined'${I}?${I}globalThis${I}:${I}${T}${I}||${I}self,${I}`:"",K=G?")":"",X=G?`${a}typeof exports${I}===${I}'object'${I}&&${I}typeof module${I}!==${I}'undefined'${I}?${I}${z}${$}(${R.join(`,${I}`)})${I}:${_}`:"",Y=`(${w(H,{isAsync:!1,name:null})}{${_}`+X+`${a}typeof ${F}${I}===${I}'function'${I}&&${I}${F}.amd${I}?${I}${F}(${B}${$})${I}:${_}`+`${a}${q}${U}${K};${_}`+`})(${W}(${w(L,{isAsync:!1,name:null})}{${j}${_}`,Q=_+_+"}));";e.prepend(`${o}${xn(i,x,g,y,b,t,a,c)}`);const Z=pn(s,i,l,x,c,a,g);let J=gn(l&&n,f,b,c);return J&&(J=_+_+J),e.append(`${Z}${J}${h}`),e.trim().indent(a).append(Q).prepend(Y)}};class Rn{constructor(e,t){this.isOriginal=!0,this.filename=e,this.content=t;}traceSegment(e,t,i){return {column:t,line:e,name:i,source:this}}}class Mn{constructor(e,t){this.sources=t,this.names=e.names,this.mappings=e.mappings;}traceMappings(){const e=[],t=new Map,i=[],s=[],n=new Map,r=[];for(const a of this.mappings){const o=[];for(const r of a){if(1===r.length)continue;const a=this.sources[r[1]];if(!a)continue;const l=a.traceSegment(r[2],r[3],5===r.length?this.names[r[4]]:"");if(l){const{column:a,line:h,name:c,source:{content:u,filename:d}}=l;let p=t.get(d);if(void 0===p)p=e.length,e.push(d),t.set(d,p),i[p]=u;else if(null==i[p])i[p]=u;else if(null!=u&&i[p]!==u)return pe({message:`Multiple conflicting contents for sourcemap source ${d}`});const f=[r[0],p,h,a];if(c){let e=n.get(c);void 0===e&&(e=s.length,s.push(c),n.set(c,e)),f[4]=e;}o.push(f);}}r.push(o);}return {mappings:r,names:s,sources:e,sourcesContent:i}}traceSegment(e,t,i){const s=this.mappings[e];if(!s)return null;let n=0,r=s.length-1;for(;n<=r;){const e=n+r>>1,a=s[e];if(a[0]===t||n===r){if(1==a.length)return null;const e=this.sources[a[1]];return e?e.traceSegment(a[2],a[3],5===a.length?this.names[a[4]]:i):null}a[0]>t?r=e-1:n=e+1;}return null}}function Dn(e){return function(t,i){return i.mappings?new Mn(i,[t]):(e({code:"SOURCEMAP_BROKEN",message:`Sourcemap is likely to be incorrect: a plugin (${i.plugin}) was used to transform files, but didn't generate a sourcemap for the transformation. Consult the plugin documentation for help`,plugin:i.plugin,url:"https://rollupjs.org/guide/en/#warning-sourcemap-is-likely-to-be-incorrect"}),new Mn({mappings:[],names:[]},[t]))}}function Ln(e,t,i,s,n){let r;if(i){const t=i.sources,s=i.sourcesContent||[],n=N(e)||".",a=i.sourceRoot||".",o=t.map(((e,t)=>new Rn(O(n,a,e),s[t])));r=new Mn(i,o);}else r=new Rn(e,t);return s.reduce(n,r)}var Vn={},Bn=Fn;function Fn(e,t){if(!e)throw new Error(t||"Assertion failed")}Fn.equal=function(e,t,i){if(e!=t)throw new Error(i||"Assertion failed: "+e+" != "+t)};var zn={exports:{}};"function"==typeof Object.create?zn.exports=function(e,t){t&&(e.super_=t,e.prototype=Object.create(t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}));}:zn.exports=function(e,t){if(t){e.super_=t;var i=function(){};i.prototype=t.prototype,e.prototype=new i,e.prototype.constructor=e;}};var jn=Bn,Un=zn.exports;function Gn(e,t){return 55296==(64512&e.charCodeAt(t))&&(!(t<0||t+1>=e.length)&&56320==(64512&e.charCodeAt(t+1)))}function Hn(e){return (e>>>24|e>>>8&65280|e<<8&16711680|(255&e)<<24)>>>0}function Wn(e){return 1===e.length?"0"+e:e}function qn(e){return 7===e.length?"0"+e:6===e.length?"00"+e:5===e.length?"000"+e:4===e.length?"0000"+e:3===e.length?"00000"+e:2===e.length?"000000"+e:1===e.length?"0000000"+e:e}Vn.inherits=Un,Vn.toArray=function(e,t){if(Array.isArray(e))return e.slice();if(!e)return [];var i=[];if("string"==typeof e)if(t){if("hex"===t)for((e=e.replace(/[^a-z0-9]+/gi,"")).length%2!=0&&(e="0"+e),n=0;n<e.length;n+=2)i.push(parseInt(e[n]+e[n+1],16));}else for(var s=0,n=0;n<e.length;n++){var r=e.charCodeAt(n);r<128?i[s++]=r:r<2048?(i[s++]=r>>6|192,i[s++]=63&r|128):Gn(e,n)?(r=65536+((1023&r)<<10)+(1023&e.charCodeAt(++n)),i[s++]=r>>18|240,i[s++]=r>>12&63|128,i[s++]=r>>6&63|128,i[s++]=63&r|128):(i[s++]=r>>12|224,i[s++]=r>>6&63|128,i[s++]=63&r|128);}else for(n=0;n<e.length;n++)i[n]=0|e[n];return i},Vn.toHex=function(e){for(var t="",i=0;i<e.length;i++)t+=Wn(e[i].toString(16));return t},Vn.htonl=Hn,Vn.toHex32=function(e,t){for(var i="",s=0;s<e.length;s++){var n=e[s];"little"===t&&(n=Hn(n)),i+=qn(n.toString(16));}return i},Vn.zero2=Wn,Vn.zero8=qn,Vn.join32=function(e,t,i,s){var n=i-t;jn(n%4==0);for(var r=new Array(n/4),a=0,o=t;a<r.length;a++,o+=4){var l;l="big"===s?e[o]<<24|e[o+1]<<16|e[o+2]<<8|e[o+3]:e[o+3]<<24|e[o+2]<<16|e[o+1]<<8|e[o],r[a]=l>>>0;}return r},Vn.split32=function(e,t){for(var i=new Array(4*e.length),s=0,n=0;s<e.length;s++,n+=4){var r=e[s];"big"===t?(i[n]=r>>>24,i[n+1]=r>>>16&255,i[n+2]=r>>>8&255,i[n+3]=255&r):(i[n+3]=r>>>24,i[n+2]=r>>>16&255,i[n+1]=r>>>8&255,i[n]=255&r);}return i},Vn.rotr32=function(e,t){return e>>>t|e<<32-t},Vn.rotl32=function(e,t){return e<<t|e>>>32-t},Vn.sum32=function(e,t){return e+t>>>0},Vn.sum32_3=function(e,t,i){return e+t+i>>>0},Vn.sum32_4=function(e,t,i,s){return e+t+i+s>>>0},Vn.sum32_5=function(e,t,i,s,n){return e+t+i+s+n>>>0},Vn.sum64=function(e,t,i,s){var n=e[t],r=s+e[t+1]>>>0,a=(r<s?1:0)+i+n;e[t]=a>>>0,e[t+1]=r;},Vn.sum64_hi=function(e,t,i,s){return (t+s>>>0<t?1:0)+e+i>>>0},Vn.sum64_lo=function(e,t,i,s){return t+s>>>0},Vn.sum64_4_hi=function(e,t,i,s,n,r,a,o){var l=0,h=t;return l+=(h=h+s>>>0)<t?1:0,l+=(h=h+r>>>0)<r?1:0,e+i+n+a+(l+=(h=h+o>>>0)<o?1:0)>>>0},Vn.sum64_4_lo=function(e,t,i,s,n,r,a,o){return t+s+r+o>>>0},Vn.sum64_5_hi=function(e,t,i,s,n,r,a,o,l,h){var c=0,u=t;return c+=(u=u+s>>>0)<t?1:0,c+=(u=u+r>>>0)<r?1:0,c+=(u=u+o>>>0)<o?1:0,e+i+n+a+l+(c+=(u=u+h>>>0)<h?1:0)>>>0},Vn.sum64_5_lo=function(e,t,i,s,n,r,a,o,l,h){return t+s+r+o+h>>>0},Vn.rotr64_hi=function(e,t,i){return (t<<32-i|e>>>i)>>>0},Vn.rotr64_lo=function(e,t,i){return (e<<32-i|t>>>i)>>>0},Vn.shr64_hi=function(e,t,i){return e>>>i},Vn.shr64_lo=function(e,t,i){return (e<<32-i|t>>>i)>>>0};var Kn={},Xn=Vn,Yn=Bn;function Qn(){this.pending=null,this.pendingTotal=0,this.blockSize=this.constructor.blockSize,this.outSize=this.constructor.outSize,this.hmacStrength=this.constructor.hmacStrength,this.padLength=this.constructor.padLength/8,this.endian="big",this._delta8=this.blockSize/8,this._delta32=this.blockSize/32;}Kn.BlockHash=Qn,Qn.prototype.update=function(e,t){if(e=Xn.toArray(e,t),this.pending?this.pending=this.pending.concat(e):this.pending=e,this.pendingTotal+=e.length,this.pending.length>=this._delta8){var i=(e=this.pending).length%this._delta8;this.pending=e.slice(e.length-i,e.length),0===this.pending.length&&(this.pending=null),e=Xn.join32(e,0,e.length-i,this.endian);for(var s=0;s<e.length;s+=this._delta32)this._update(e,s,s+this._delta32);}return this},Qn.prototype.digest=function(e){return this.update(this._pad()),Yn(null===this.pending),this._digest(e)},Qn.prototype._pad=function(){var e=this.pendingTotal,t=this._delta8,i=t-(e+this.padLength)%t,s=new Array(i+this.padLength);s[0]=128;for(var n=1;n<i;n++)s[n]=0;if(e<<=3,"big"===this.endian){for(var r=8;r<this.padLength;r++)s[n++]=0;s[n++]=0,s[n++]=0,s[n++]=0,s[n++]=0,s[n++]=e>>>24&255,s[n++]=e>>>16&255,s[n++]=e>>>8&255,s[n++]=255&e;}else for(s[n++]=255&e,s[n++]=e>>>8&255,s[n++]=e>>>16&255,s[n++]=e>>>24&255,s[n++]=0,s[n++]=0,s[n++]=0,s[n++]=0,r=8;r<this.padLength;r++)s[n++]=0;return s};var Zn={},Jn=Vn.rotr32;function er(e,t,i){return e&t^~e&i}function tr(e,t,i){return e&t^e&i^t&i}function ir(e,t,i){return e^t^i}Zn.ft_1=function(e,t,i,s){return 0===e?er(t,i,s):1===e||3===e?ir(t,i,s):2===e?tr(t,i,s):void 0},Zn.ch32=er,Zn.maj32=tr,Zn.p32=ir,Zn.s0_256=function(e){return Jn(e,2)^Jn(e,13)^Jn(e,22)},Zn.s1_256=function(e){return Jn(e,6)^Jn(e,11)^Jn(e,25)},Zn.g0_256=function(e){return Jn(e,7)^Jn(e,18)^e>>>3},Zn.g1_256=function(e){return Jn(e,17)^Jn(e,19)^e>>>10};var sr=Vn,nr=Kn,rr=Zn,ar=Bn,or=sr.sum32,lr=sr.sum32_4,hr=sr.sum32_5,cr=rr.ch32,ur=rr.maj32,dr=rr.s0_256,pr=rr.s1_256,fr=rr.g0_256,mr=rr.g1_256,gr=nr.BlockHash,yr=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];function xr(){if(!(this instanceof xr))return new xr;gr.call(this),this.h=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],this.k=yr,this.W=new Array(64);}sr.inherits(xr,gr);var Er=xr;xr.blockSize=512,xr.outSize=256,xr.hmacStrength=192,xr.padLength=64,xr.prototype._update=function(e,t){for(var i=this.W,s=0;s<16;s++)i[s]=e[t+s];for(;s<i.length;s++)i[s]=lr(mr(i[s-2]),i[s-7],fr(i[s-15]),i[s-16]);var n=this.h[0],r=this.h[1],a=this.h[2],o=this.h[3],l=this.h[4],h=this.h[5],c=this.h[6],u=this.h[7];for(ar(this.k.length===i.length),s=0;s<i.length;s++){var d=hr(u,pr(l),cr(l,h,c),this.k[s],i[s]),p=or(dr(n),ur(n,r,a));u=c,c=h,h=l,l=or(o,d),o=a,a=r,r=n,n=or(d,p);}this.h[0]=or(this.h[0],n),this.h[1]=or(this.h[1],r),this.h[2]=or(this.h[2],a),this.h[3]=or(this.h[3],o),this.h[4]=or(this.h[4],l),this.h[5]=or(this.h[5],h),this.h[6]=or(this.h[6],c),this.h[7]=or(this.h[7],u);},xr.prototype._digest=function(e){return "hex"===e?sr.toHex32(this.h,"big"):sr.split32(this.h,"big")};var br=Er;const vr=()=>br(),Sr={amd:kr,cjs:kr,es:Ir,iife:kr,system:Ir,umd:kr};function Ar(e,t,i,s,n,r,a,o,l,h,c,u,d){const p=e.slice().reverse();for(const e of p)e.scope.addUsedOutsideNames(s,n,c,u);!function(e,t,i){for(const s of t){for(const t of s.scope.variables.values())t.included&&!(t.renderBaseName||t instanceof Ms&&t.getOriginalVariable()!==t)&&t.setRenderNames(null,Vt(t.name,e));if(i.has(s)){const t=s.namespace;t.setRenderNames(null,Vt(t.name,e));}}}(s,p,d),Sr[n](s,i,t,r,a,o,l,h);for(const e of p)e.scope.deconflict(n,c,u);}function Ir(e,t,i,s,n,r,a,o){for(const t of i.dependencies)(n||t instanceof $e)&&(t.variableName=Vt(t.suggestedVariableName,e));for(const i of t){const t=i.module,s=i.name;i.isNamespace&&(n||t instanceof $e)?i.setRenderNames(null,(t instanceof $e?t:a.get(t)).variableName):t instanceof $e&&"default"===s?i.setRenderNames(null,Vt([...t.exportedVariables].some((([e,t])=>"*"===t&&e.included))?t.suggestedVariableName+"__default":t.suggestedVariableName,e)):i.setRenderNames(null,Vt(s,e));}for(const t of o)t.setRenderNames(null,Vt(t.name,e));}function kr(e,t,{deconflictedDefault:i,deconflictedNamespace:s,dependencies:n},r,a,o,l){for(const t of n)t.variableName=Vt(t.suggestedVariableName,e);for(const t of s)t.namespaceVariableName=Vt(`${t.suggestedVariableName}__namespace`,e);for(const t of i)s.has(t)&&ss(String(r(t.id)),o)?t.defaultVariableName=t.namespaceVariableName:t.defaultVariableName=Vt(`${t.suggestedVariableName}__default`,e);for(const e of t){const t=e.module;if(t instanceof $e){const i=e.name;if("default"===i){const i=String(r(t.id)),s=es[i]?t.defaultVariableName:t.variableName;ts(i,o)?e.setRenderNames(s,"default"):e.setRenderNames(null,s);}else "*"===i?e.setRenderNames(null,is[String(r(t.id))]?t.namespaceVariableName:t.variableName):e.setRenderNames(t.variableName,null);}else {const i=l.get(t);a&&e.isNamespace?e.setRenderNames(null,"default"===i.exportMode?i.namespaceVariableName:i.variableName):"default"===i.exportMode?e.setRenderNames(null,i.variableName):e.setRenderNames(i.variableName,i.getVariableExportName(e));}}}const Pr=/[\\'\r\n\u2028\u2029]/,wr=/(['\r\n\u2028\u2029])/g,Cr=/\\/g;function _r(e){return e.match(Pr)?e.replace(Cr,"\\\\").replace(wr,"\\$1"):e}function Nr(e,{exports:t,name:i,format:s},n,r,a){const o=e.getExportNames();if("default"===t){if(1!==o.length||"default"!==o[0])return pe(ye("default",o,r))}else if("none"===t&&o.length)return pe(ye("none",o,r));return "auto"===t&&(0===o.length?t="none":1===o.length&&"default"===o[0]?("cjs"===s&&n.has("exports")&&a(function(e){const t=he(e);return {code:me.PREFER_NAMED_EXPORTS,id:e,message:`Entry module "${t}" is implicitly using "default" export mode, which means for CommonJS output that its default export is assigned to "module.exports". For many tools, such CommonJS output will not be interchangeable with the original ES module. If this is intended, explicitly set "output.exports" to either "auto" or "default", otherwise you might want to consider changing the signature of "${t}" to use named exports only.`,url:"https://rollupjs.org/guide/en/#outputexports"}}(r)),t="default"):("es"!==s&&"system"!==s&&o.includes("default")&&a(function(e,t){return {code:me.MIXED_EXPORTS,id:e,message:`Entry module "${he(e)}" is using named and default exports together. Consumers of your bundle will have to use \`${t||"chunk"}["default"]\` to access the default export, which may not be what you want. Use \`output.exports: "named"\` to disable this warning`,url:"https://rollupjs.org/guide/en/#outputexports"}}(r,i)),t="named")),t}function $r(e){const t=e.split("\n"),i=t.filter((e=>/^\t+/.test(e))),s=t.filter((e=>/^ {2,}/.test(e)));if(0===i.length&&0===s.length)return null;if(i.length>=s.length)return "\t";const n=s.reduce(((e,t)=>{const i=/^ +/.exec(t)[0].length;return Math.min(i,e)}),1/0);return new Array(n+1).join(" ")}function Tr(e,t,i,s,n){const r=e.getDependenciesToBeIncluded();for(const e of r){if(e instanceof $e){t.push(e);continue}const r=n.get(e);r===s?i.has(e)||(i.add(e),Tr(e,t,i,s,n)):t.push(r);}}function Or(e){if(!e)return null;if("string"==typeof e&&(e=JSON.parse(e)),""===e.mappings)return {mappings:[],names:[],sources:[],version:3};const i="string"==typeof e.mappings?function(e){for(var i=[],s=[],r=[0,0,0,0,0],a=0,o=0,l=0,h=0;o<e.length;o++){var c=e.charCodeAt(o);if(44===c)n(s,r,a),a=0;else if(59===c)n(s,r,a),a=0,i.push(s),s=[],r[0]=0;else {var u=t[c];if(void 0===u)throw new Error("Invalid character ("+String.fromCharCode(c)+")");var d=32&u;if(h+=(u&=31)<<l,d)l+=5;else {var p=1&h;h>>>=1,p&&(h=0===h?-2147483648:-h),r[a]+=h,a++,h=l=0;}}}return n(s,r,a),i.push(s),i}(e.mappings):e.mappings;return {...e,mappings:i}}function Rr(e,t,i){return ce(e)?pe(Ae(`Invalid pattern "${e}" for "${t}", patterns can be neither absolute nor relative paths. If you want your files to be stored in a subdirectory, write its name without a leading slash like this: subdirectory/pattern.`)):e.replace(/\[(\w+)\]/g,((e,s)=>{if(!i.hasOwnProperty(s))return pe(Ae(`"[${s}]" is not a valid placeholder in "${t}" pattern.`));const n=i[s]();return ce(n)?pe(Ae(`Invalid substitution "${n}" for placeholder "[${s}]" in "${t}" pattern, can be neither absolute nor relative path.`)):n}))}function Mr(e,t){const i=new Set(Object.keys(t).map((e=>e.toLowerCase())));if(!i.has(e.toLocaleLowerCase()))return e;const s=$(e);e=e.substring(0,e.length-s.length);let n,r=1;for(;i.has((n=e+ ++r+s).toLowerCase()););return n}const Dr=[".js",".jsx",".ts",".tsx"];function Lr(e,t,i,s){const n="function"==typeof t?t(e.id):t[e.id];return n||(i?(s({code:"MISSING_GLOBAL_NAME",guess:e.variableName,message:`No name was provided for external module '${e.id}' in output.globals – guessing '${e.variableName}'`,source:e.id}),e.variableName):void 0)}class Vr{constructor(e,t,i,s,n,r,a,o,l,h){this.orderedModules=e,this.inputOptions=t,this.outputOptions=i,this.unsetOptions=s,this.pluginDriver=n,this.modulesById=r,this.chunkByModule=a,this.facadeChunkByModule=o,this.includedNamespaces=l,this.manualChunkAlias=h,this.entryModules=[],this.exportMode="named",this.facadeModule=null,this.id=null,this.namespaceVariableName="",this.needsExportsShim=!1,this.variableName="",this.accessedGlobalsByScope=new Map,this.dependencies=new Set,this.dynamicDependencies=new Set,this.dynamicEntryModules=[],this.dynamicName=null,this.exportNamesByVariable=new Map,this.exports=new Set,this.exportsByName=new Map,this.fileName=null,this.implicitEntryModules=[],this.implicitlyLoadedBefore=new Set,this.imports=new Set,this.includedReexportsByModule=new Map,this.indentString=void 0,this.isEmpty=!0,this.name=null,this.renderedDependencies=null,this.renderedExports=null,this.renderedHash=void 0,this.renderedModuleSources=new Map,this.renderedModules=Object.create(null),this.renderedSource=null,this.sortedExportNames=null,this.strictFacade=!1,this.usedModules=void 0,this.execIndex=e.length>0?e[0].execIndex:1/0;const c=new Set(e);for(const t of e){t.namespace.included&&l.add(t),this.isEmpty&&t.isIncluded()&&(this.isEmpty=!1),(t.info.isEntry||i.preserveModules)&&this.entryModules.push(t);for(const e of t.includedDynamicImporters)c.has(e)||(this.dynamicEntryModules.push(t),t.info.syntheticNamedExports&&!i.preserveModules&&(l.add(t),this.exports.add(t.namespace)));t.implicitlyLoadedAfter.size>0&&this.implicitEntryModules.push(t);}this.suggestedVariableName=Ne(this.generateVariableName());}static generateFacade(e,t,i,s,n,r,a,o,l,h){const c=new Vr([],e,t,i,s,n,r,a,o,null);c.assignFacadeName(h,l),a.has(l)||a.set(l,c);for(const e of l.getDependenciesToBeIncluded())c.dependencies.add(e instanceof ln?r.get(e):e);return !c.dependencies.has(r.get(l))&&l.info.moduleSideEffects&&l.hasEffects()&&c.dependencies.add(r.get(l)),c.ensureReexportsAreAvailableForModule(l),c.facadeModule=l,c.strictFacade=!0,c}canModuleBeFacade(e,t){const i=e.getExportNamesByVariable();for(const t of this.exports)if(!i.has(t))return 0===i.size&&e.isUserDefinedEntryPoint&&"strict"===e.preserveSignature&&this.unsetOptions.has("preserveEntrySignatures")&&this.inputOptions.onwarn({code:"EMPTY_FACADE",id:e.id,message:`To preserve the export signature of the entry module "${he(e.id)}", an empty facade chunk was created. This often happens when creating a bundle for a web app where chunks are placed in script tags and exports are ignored. In this case it is recommended to set "preserveEntrySignatures: false" to avoid this and reduce the number of chunks. Otherwise if this is intentional, set "preserveEntrySignatures: 'strict'" explicitly to silence this warning.`,url:"https://rollupjs.org/guide/en/#preserveentrysignatures"}),!1;for(const s of t)if(!i.has(s)&&s.module!==e)return !1;return !0}generateExports(){this.sortedExportNames=null;const e=new Set(this.exports);if(null!==this.facadeModule&&(!1!==this.facadeModule.preserveSignature||this.strictFacade)){const t=this.facadeModule.getExportNamesByVariable();for(const[i,s]of t){this.exportNamesByVariable.set(i,[...s]);for(const e of s)this.exportsByName.set(e,i);e.delete(i);}}this.outputOptions.minifyInternalExports?function(e,t,i){let s=0;for(const n of e){let[e]=n.name;if(t.has(e))do{e=Lt(++s),49===e.charCodeAt(0)&&(s+=9*64**(e.length-1),e=Lt(s));}while(we.has(e)||t.has(e));t.set(e,n),i.set(n,[e]);}}(e,this.exportsByName,this.exportNamesByVariable):function(e,t,i){for(const s of e){let e=0,n=s.name;for(;t.has(n);)n=s.name+"$"+ ++e;t.set(n,s),i.set(s,[n]);}}(e,this.exportsByName,this.exportNamesByVariable),(this.outputOptions.preserveModules||this.facadeModule&&this.facadeModule.info.isEntry)&&(this.exportMode=Nr(this,this.outputOptions,this.unsetOptions,this.facadeModule.id,this.inputOptions.onwarn));}generateFacades(){var e;const t=[],i=new Set([...this.entryModules,...this.implicitEntryModules]),s=new Set(this.dynamicEntryModules.map((({namespace:e})=>e)));for(const e of i)if(e.preserveSignature)for(const t of e.getExportNamesByVariable().keys())s.add(t);for(const e of i){const i=Array.from(new Set(e.chunkNames.filter((({isUserDefined:e})=>e)).map((({name:e})=>e))),(e=>({name:e})));if(0===i.length&&e.isUserDefinedEntryPoint&&i.push({}),i.push(...Array.from(e.chunkFileNames,(e=>({fileName:e})))),0===i.length&&i.push({}),!this.facadeModule){const t="strict"===e.preserveSignature||"exports-only"===e.preserveSignature&&0!==e.getExportNamesByVariable().size;(!t||this.outputOptions.preserveModules||this.canModuleBeFacade(e,s))&&(this.facadeModule=e,this.facadeChunkByModule.set(e,this),e.preserveSignature&&(this.strictFacade=t),this.assignFacadeName(i.shift(),e));}for(const s of i)t.push(Vr.generateFacade(this.inputOptions,this.outputOptions,this.unsetOptions,this.pluginDriver,this.modulesById,this.chunkByModule,this.facadeChunkByModule,this.includedNamespaces,e,s));}for(const t of this.dynamicEntryModules)t.info.syntheticNamedExports||(!this.facadeModule&&this.canModuleBeFacade(t,s)?(this.facadeModule=t,this.facadeChunkByModule.set(t,this),this.strictFacade=!0,this.dynamicName=Br(t)):this.facadeModule===t&&!this.strictFacade&&this.canModuleBeFacade(t,s)?this.strictFacade=!0:(null===(e=this.facadeChunkByModule.get(t))||void 0===e?void 0:e.strictFacade)||(this.includedNamespaces.add(t),this.exports.add(t.namespace)));return this.outputOptions.preserveModules||this.addNecessaryImportsForFacades(),t}generateId(e,t,i,s){if(null!==this.fileName)return this.fileName;const[n,r]=this.facadeModule&&this.facadeModule.isUserDefinedEntryPoint?[t.entryFileNames,"output.entryFileNames"]:[t.chunkFileNames,"output.chunkFileNames"];return Mr(Rr("function"==typeof n?n(this.getChunkInfo()):n,r,{format:()=>t.format,hash:()=>s?this.computeContentHashWithDependencies(e,t,i):"[hash]",name:()=>this.getChunkName()}),i)}generateIdPreserveModules(e,t,i,s){const[{id:n}]=this.orderedModules,r=this.outputOptions.sanitizeFileName(n.split(Fr,1)[0]);let a;const o=s.has("entryFileNames")?"[name][assetExtname].js":t.entryFileNames,l="function"==typeof o?o(this.getChunkInfo()):o;if(P(r)){const i=N(r),s=$(r),n=`${i}/${Rr(l,"output.entryFileNames",{assetExtname:()=>Dr.includes(s)?"":s,ext:()=>s.substring(1),extname:()=>s,format:()=>t.format,name:()=>this.getChunkName()})}`,{preserveModulesRoot:o}=t;a=o&&n.startsWith(o)?n.slice(o.length).replace(/^[\\/]/,""):T(e,n);}else {const e=$(r);a=`_virtual/${Rr(l,"output.entryFileNames",{assetExtname:()=>Dr.includes(e)?"":e,ext:()=>e.substring(1),extname:()=>e,format:()=>t.format,name:()=>le(r)})}`;}return Mr(C(a),i)}getChunkInfo(){const e=this.facadeModule,t=this.getChunkName.bind(this);return {exports:this.getExportNames(),facadeModuleId:e&&e.id,isDynamicEntry:this.dynamicEntryModules.length>0,isEntry:null!==e&&e.info.isEntry,isImplicitEntry:this.implicitEntryModules.length>0,modules:this.renderedModules,get name(){return t()},type:"chunk"}}getChunkInfoWithFileNames(){return Object.assign(this.getChunkInfo(),{code:void 0,dynamicImports:Array.from(this.dynamicDependencies,Hs),fileName:this.id,implicitlyLoadedBefore:Array.from(this.implicitlyLoadedBefore,Hs),importedBindings:this.getImportedBindingsPerDependency(),imports:Array.from(this.dependencies,Hs),map:void 0,referencedFiles:this.getReferencedFiles()})}getChunkName(){var e;return null!==(e=this.name)&&void 0!==e?e:this.name=this.outputOptions.sanitizeFileName(this.getFallbackChunkName())}getExportNames(){var e;return null!==(e=this.sortedExportNames)&&void 0!==e?e:this.sortedExportNames=Array.from(this.exportsByName.keys()).sort()}getRenderedHash(){if(this.renderedHash)return this.renderedHash;const e=vr(),t=this.pluginDriver.hookReduceValueSync("augmentChunkHash","",[this.getChunkInfo()],((e,t)=>(t&&(e+=t),e)));return e.update(t),e.update(this.renderedSource.toString()),e.update(this.getExportNames().map((e=>{const t=this.exportsByName.get(e);return `${he(t.module.id).replace(/\\/g,"/")}:${t.name}:${e}`})).join(",")),this.renderedHash=e.digest("hex")}getVariableExportName(e){return this.outputOptions.preserveModules&&e instanceof js?"*":this.exportNamesByVariable.get(e)[0]}link(){this.dependencies=function(e,t,i){const s=[],n=new Set;for(let r=t.length-1;r>=0;r--){const a=t[r];if(!n.has(a)){const t=[];Tr(a,t,n,e,i),s.unshift(t);}}const r=new Set;for(const e of s)for(const t of e)r.add(t);return r}(this,this.orderedModules,this.chunkByModule);for(const e of this.orderedModules)this.addDependenciesToChunk(e.dynamicDependencies,this.dynamicDependencies),this.addDependenciesToChunk(e.implicitlyLoadedBefore,this.implicitlyLoadedBefore),this.setUpChunkImportsAndExportsForModule(e);}preRender(e,t,i){const{_:s,getPropertyAccess:n,n:r}=i,a=new b({separator:`${r}${r}`});this.usedModules=[],this.indentString=function(e,t){if(!0!==t.indent)return t.indent;for(const t of e){const e=$r(t.originalCode);if(null!==e)return e}return "\t"}(this.orderedModules,e);const o={dynamicImportFunction:e.dynamicImportFunction,exportNamesByVariable:this.exportNamesByVariable,format:e.format,freeze:e.freeze,indent:this.indentString,namespaceToStringTag:e.namespaceToStringTag,outputPluginDriver:this.pluginDriver,snippets:i};if(e.hoistTransitiveImports&&!this.outputOptions.preserveModules&&null!==this.facadeModule)for(const e of this.dependencies)e instanceof Vr&&this.inlineChunkDependencies(e);this.prepareModulesForRendering(i),this.setIdentifierRenderResolutions(e);let l="";const h=this.renderedModules;for(const t of this.orderedModules){let i=0;if(t.isIncluded()||this.includedNamespaces.has(t)){const s=t.render(o).trim();i=s.length(),i&&(e.compact&&s.lastLine().includes("//")&&s.append("\n"),this.renderedModuleSources.set(t,s),a.addSource(s),this.usedModules.push(t));const n=t.namespace;if(this.includedNamespaces.has(t)&&!this.outputOptions.preserveModules){const e=n.renderBlock(o);n.renderFirst()?l+=r+e:a.addSource(new x(e));}}const{renderedExports:s,removedExports:n}=t.getRenderedExports(),{renderedModuleSources:c}=this;h[t.id]={get code(){var e,i;return null!==(i=null===(e=c.get(t))||void 0===e?void 0:e.toString())&&void 0!==i?i:null},originalLength:t.originalCode.length,removedExports:n,renderedExports:s,renderedLength:i};}if(l&&a.prepend(l+r+r),this.needsExportsShim&&a.prepend(`${r}${i.cnst} _missingExportShim${s}=${s}void 0;${r}${r}`),e.compact?this.renderedSource=a:this.renderedSource=a.trim(),this.renderedHash=void 0,this.isEmpty&&0===this.getExportNames().length&&0===this.dependencies.size){const e=this.getChunkName();this.inputOptions.onwarn({chunkName:e,code:"EMPTY_BUNDLE",message:`Generated an empty chunk: "${e}"`});}this.setExternalRenderPaths(e,t),this.renderedDependencies=this.getChunkDependencyDeclarations(e,n),this.renderedExports="none"===this.exportMode?[]:this.getChunkExportDeclarations(e.format,n);}async render(e,t,i,s){en("render format",2);const n=e.format,r=On[n];e.dynamicImportFunction&&"es"!==n&&this.inputOptions.onwarn(xe("output.dynamicImportFunction","outputdynamicImportFunction",'this option is ignored for formats other than "es"'));for(const e of this.dependencies){const t=this.renderedDependencies.get(e);if(e instanceof $e){const i=e.renderPath;t.id=_r(e.renormalizeRenderPath?de(this.id,i,!1,!1):i);}else t.namedExportsMode="default"!==e.exportMode,t.id=_r(de(this.id,e.id,!1,!0));}this.finaliseDynamicImports(e,s),this.finaliseImportMetas(n,s);const a=0!==this.renderedExports.length||[...this.renderedDependencies.values()].some((e=>e.reexports&&0!==e.reexports.length));let o=null;const l=new Set;for(const e of this.orderedModules){e.usesTopLevelAwait&&(o=e.id);const t=this.accessedGlobalsByScope.get(e.scope);if(t)for(const e of t)l.add(e);}if(null!==o&&"es"!==n&&"system"!==n)return pe({code:"INVALID_TLA_FORMAT",id:o,message:`Module format ${n} does not support top-level await. Use the "es" or "system" output formats rather.`});if(!this.id)throw new Error("Internal Error: expecting chunk id");const c=r(this.renderedSource,{accessedGlobals:l,dependencies:[...this.renderedDependencies.values()],exports:this.renderedExports,hasExports:a,id:this.id,indent:this.indentString,intro:t.intro,isEntryFacade:this.outputOptions.preserveModules||null!==this.facadeModule&&this.facadeModule.info.isEntry,isModuleFacade:null!==this.facadeModule,namedExportsMode:"default"!==this.exportMode,outro:t.outro,snippets:s,usesTopLevelAwait:null!==o,warn:this.inputOptions.onwarn},e);t.banner&&c.prepend(t.banner),t.footer&&c.append(t.footer);const u=c.toString();tn("render format",2);let d=null;const p=[];let f=await function({code:e,options:t,outputPluginDriver:i,renderChunk:s,sourcemapChain:n}){return i.hookReduceArg0("renderChunk",[e,s,t],((e,t,i)=>{if(null==t)return e;if("string"==typeof t&&(t={code:t,map:void 0}),null!==t.map){const e=Or(t.map);n.push(e||{missing:!0,plugin:i.name});}return t.code}))}({code:u,options:e,outputPluginDriver:this.pluginDriver,renderChunk:i,sourcemapChain:p});if(e.sourcemap){let t;en("sourcemap",2),t=e.file?O(e.sourcemapFile||e.file):e.dir?O(e.dir,this.id):O(this.id);const i=c.generateDecodedMap({});d=function(e,t,i,s,n,r){const a=Dn(r),o=i.filter((e=>!e.excludeFromSourcemap)).map((e=>Ln(e.id,e.originalCode,e.originalSourcemap,e.sourcemapChain,a))),l=new Mn(t,o),c=s.reduce(a,l);let{sources:u,sourcesContent:d,names:p,mappings:f}=c.traceMappings();if(e){const t=N(e);u=u.map((e=>T(t,e))),e=_(e);}return d=n?null:d,new h({file:e,mappings:f,names:p,sources:u,sourcesContent:d})}(t,i,this.usedModules,p,e.sourcemapExcludeSources,this.inputOptions.onwarn),d.sources=d.sources.map((i=>{const{sourcemapPathTransform:s}=e;if(s){const e=s(i,`${t}.map`);return "string"!=typeof e&&pe(Ae("sourcemapPathTransform function must return a string.")),e}return i})).map(C),tn("sourcemap",2);}return e.compact||"\n"===f[f.length-1]||(f+="\n"),{code:f,map:d}}addDependenciesToChunk(e,t){for(const i of e)if(i instanceof ln){const e=this.chunkByModule.get(i);e&&e!==this&&t.add(e);}else t.add(i);}addNecessaryImportsForFacades(){for(const[e,t]of this.includedReexportsByModule)if(this.includedNamespaces.has(e))for(const e of t)this.imports.add(e);}assignFacadeName({fileName:e,name:t},i){e?this.fileName=e:this.name=this.outputOptions.sanitizeFileName(t||Br(i));}checkCircularDependencyImport(e,t){const i=e.module;if(i instanceof ln){const o=this.chunkByModule.get(i);let l;do{if(l=t.alternativeReexportModules.get(e),l){const h=this.chunkByModule.get(l);h&&h!==o&&this.inputOptions.onwarn((s=i.getExportNamesByVariable().get(e)[0],n=i.id,r=l.id,a=t.id,{code:me.CYCLIC_CROSS_CHUNK_REEXPORT,exporter:n,importer:a,message:`Export "${s}" of module ${he(n)} was reexported through module ${he(r)} while both modules are dependencies of each other and will end up in different chunks by current Rollup settings. This scenario is not well supported at the moment as it will produce a circular dependency between chunks and will likely lead to broken execution order.\nEither change the import in ${he(a)} to point directly to the exporting module or do not use "preserveModules" to ensure these modules end up in the same chunk.`,reexporter:r})),t=l;}}while(l)}var s,n,r,a;}computeContentHashWithDependencies(e,t,i){const s=vr();s.update([e.intro,e.outro,e.banner,e.footer].join(":")),s.update(t.format);const n=new Set([this]);for(const r of n)if(r instanceof $e?s.update(`:${r.renderPath}`):(s.update(r.getRenderedHash()),s.update(r.generateId(e,t,i,!1))),!(r instanceof $e))for(const e of [...r.dependencies,...r.dynamicDependencies])n.add(e);return s.digest("hex").substr(0,8)}ensureReexportsAreAvailableForModule(e){const t=[],i=e.getExportNamesByVariable();for(const s of i.keys()){const i=s instanceof Us,n=i?s.getBaseVariable():s;if(!(n instanceof js&&this.outputOptions.preserveModules)){this.checkCircularDependencyImport(n,e);const s=n.module;if(s instanceof ln){const e=this.chunkByModule.get(s);e&&e!==this&&(e.exports.add(n),t.push(n),i&&this.imports.add(n));}}}t.length&&this.includedReexportsByModule.set(e,t);}finaliseDynamicImports(e,t){const i="amd"===e.format;for(const[e,s]of this.renderedModuleSources)for(const{node:n,resolution:r}of e.dynamicImports){const e=this.chunkByModule.get(r),a=this.facadeChunkByModule.get(r);if(!r||!n.included||e===this)continue;const o=r instanceof ln?`'${_r(de(this.id,(a||e).id,i,!0))}'`:r instanceof $e?`'${_r(r.renormalizeRenderPath?de(this.id,r.renderPath,i,!1):r.renderPath)}'`:r;n.renderFinalResolution(s,o,r instanceof ln&&!(null==a?void 0:a.strictFacade)&&e.exportNamesByVariable.get(r.namespace)[0],t);}}finaliseImportMetas(e,t){for(const[i,s]of this.renderedModuleSources)for(const n of i.importMetas)n.renderFinalMechanism(s,this.id,e,t,this.pluginDriver);}generateVariableName(){if(this.manualChunkAlias)return this.manualChunkAlias;const e=this.entryModules[0]||this.implicitEntryModules[0]||this.dynamicEntryModules[0]||this.orderedModules[this.orderedModules.length-1];return e?Br(e):"chunk"}getChunkDependencyDeclarations(e,t){const i=this.getImportSpecifiers(t),s=this.getReexportSpecifiers(),n=new Map;for(const t of this.dependencies){const r=i.get(t)||null,a=s.get(t)||null,o=t instanceof $e||"default"!==t.exportMode;n.set(t,{defaultVariableName:t.defaultVariableName,globalName:t instanceof $e&&("umd"===e.format||"iife"===e.format)&&Lr(t,e.globals,null!==(r||a),this.inputOptions.onwarn),id:void 0,imports:r,isChunk:t instanceof Vr,name:t.variableName,namedExportsMode:o,namespaceVariableName:t.namespaceVariableName,reexports:a});}return n}getChunkExportDeclarations(e,t){const i=[];for(const s of this.getExportNames()){if("*"===s[0])continue;const n=this.exportsByName.get(s);if(!(n instanceof Us)){const e=n.module;if(e&&this.chunkByModule.get(e)!==this)continue}let r=null,a=!1,o=n.getName(t);if(n instanceof Dt){for(const e of n.declarations)if(e.parent instanceof qi||e instanceof Ki&&e.declaration instanceof qi){a=!0;break}}else n instanceof Us&&(r=o,"es"===e&&(o=n.renderName));i.push({exported:s,expression:r,hoisted:a,local:o});}return i}getDependenciesToBeDeconflicted(e,t,i){const s=new Set,n=new Set,r=new Set;for(const t of [...this.exportNamesByVariable.keys(),...this.imports])if(e||t.isNamespace){const a=t.module;if(a instanceof $e)s.add(a),e&&("default"===t.name?es[String(i(a.id))]&&n.add(a):"*"===t.name&&is[String(i(a.id))]&&r.add(a));else {const i=this.chunkByModule.get(a);i!==this&&(s.add(i),e&&"default"===i.exportMode&&t.isNamespace&&r.add(i));}}if(t)for(const e of this.dependencies)s.add(e);return {deconflictedDefault:n,deconflictedNamespace:r,dependencies:s}}getFallbackChunkName(){return this.manualChunkAlias?this.manualChunkAlias:this.dynamicName?this.dynamicName:this.fileName?le(this.fileName):le(this.orderedModules[this.orderedModules.length-1].id)}getImportSpecifiers(e){const{interop:t}=this.outputOptions,i=new Map;for(const s of this.imports){const n=s.module;let r,a;if(n instanceof $e){if(r=n,a=s.name,"default"!==a&&"*"!==a&&"defaultOnly"===t(n.id))return pe(ve(n.id,a,!1))}else r=this.chunkByModule.get(n),a=r.getVariableExportName(s);R(i,r,(()=>[])).push({imported:a,local:s.getName(e)});}return i}getImportedBindingsPerDependency(){const e={};for(const[t,i]of this.renderedDependencies){const s=new Set;if(i.imports)for(const{imported:e}of i.imports)s.add(e);if(i.reexports)for(const{imported:e}of i.reexports)s.add(e);e[t.id]=[...s];}return e}getReexportSpecifiers(){const{externalLiveBindings:e,interop:t}=this.outputOptions,i=new Map;for(let s of this.getExportNames()){let n,r,a=!1;if("*"===s[0]){const i=s.substring(1);"defaultOnly"===t(i)&&this.inputOptions.onwarn(Se(i)),a=e,n=this.modulesById.get(i),r=s="*";}else {const i=this.exportsByName.get(s);if(i instanceof Us)continue;const o=i.module;if(o instanceof ln){if(n=this.chunkByModule.get(o),n===this)continue;r=n.getVariableExportName(i),a=i.isReassigned;}else {if(n=o,r=i.name,"default"!==r&&"*"!==r&&"defaultOnly"===t(o.id))return pe(ve(o.id,r,!0));a=e&&("default"!==r||ts(String(t(o.id)),!0));}}R(i,n,(()=>[])).push({imported:r,needsLiveBinding:a,reexported:s});}return i}getReferencedFiles(){const e=[];for(const t of this.orderedModules)for(const i of t.importMetas){const t=i.getReferencedFileName(this.pluginDriver);t&&e.push(t);}return e}inlineChunkDependencies(e){for(const t of e.dependencies)this.dependencies.has(t)||(this.dependencies.add(t),t instanceof Vr&&this.inlineChunkDependencies(t));}prepareModulesForRendering(e){var t;const i=this.accessedGlobalsByScope;for(const s of this.orderedModules){for(const{node:n,resolution:r}of s.dynamicImports)if(n.included)if(r instanceof ln){const s=this.chunkByModule.get(r);s===this?n.setInternalResolution(r.namespace):n.setExternalResolution((null===(t=this.facadeChunkByModule.get(r))||void 0===t?void 0:t.exportMode)||s.exportMode,r,this.outputOptions,e,this.pluginDriver,i);}else n.setExternalResolution("external",r,this.outputOptions,e,this.pluginDriver,i);for(const e of s.importMetas)e.addAccessedGlobals(this.outputOptions.format,i);this.includedNamespaces.has(s)&&!this.outputOptions.preserveModules&&s.namespace.prepare(i);}}setExternalRenderPaths(e,t){for(const i of [...this.dependencies,...this.dynamicDependencies])i instanceof $e&&i.setRenderPath(e,t);}setIdentifierRenderResolutions({format:e,interop:t,namespaceToStringTag:i}){const s=new Set;for(const t of this.getExportNames()){const i=this.exportsByName.get(t);"es"!==e&&"system"!==e&&i.isReassigned&&!i.isId?i.setRenderNames("exports",t):i instanceof Us?s.add(i):i.setRenderNames(null,null);}for(const e of this.orderedModules)if(e.needsExportShim){this.needsExportsShim=!0;break}const n=new Set(["Object","Promise"]);switch(this.needsExportsShim&&n.add("_missingExportShim"),i&&n.add("Symbol"),e){case"system":n.add("module").add("exports");break;case"es":break;case"cjs":n.add("module").add("require").add("__filename").add("__dirname");default:n.add("exports");for(const e of ys)n.add(e);}Ar(this.orderedModules,this.getDependenciesToBeDeconflicted("es"!==e&&"system"!==e,"amd"===e||"umd"===e||"iife"===e,t),this.imports,n,e,t,this.outputOptions.preserveModules,this.outputOptions.externalLiveBindings,this.chunkByModule,s,this.exportNamesByVariable,this.accessedGlobalsByScope,this.includedNamespaces);}setUpChunkImportsAndExportsForModule(e){const t=new Set(e.includedImports);if(!this.outputOptions.preserveModules&&this.includedNamespaces.has(e)){const i=e.namespace.getMemberVariables();for(const e of Object.values(i))t.add(e);}for(let i of t){i instanceof Ms&&(i=i.getOriginalVariable()),i instanceof Us&&(i=i.getBaseVariable());const t=this.chunkByModule.get(i.module);t!==this&&(this.imports.add(i),!(i instanceof js&&this.outputOptions.preserveModules)&&i.module instanceof ln&&(t.exports.add(i),this.checkCircularDependencyImport(i,e)));}(this.includedNamespaces.has(e)||e.info.isEntry&&!1!==e.preserveSignature||e.includedDynamicImporters.some((e=>this.chunkByModule.get(e)!==this)))&&this.ensureReexportsAreAvailableForModule(e);for(const{node:t,resolution:i}of e.dynamicImports)t.included&&i instanceof ln&&this.chunkByModule.get(i)===this&&!this.includedNamespaces.has(i)&&(this.includedNamespaces.add(i),this.ensureReexportsAreAvailableForModule(i));}}function Br(e){var t,i,s,n;return null!==(n=null!==(i=null===(t=e.chunkNames.find((({isUserDefined:e})=>e)))||void 0===t?void 0:t.name)&&void 0!==i?i:null===(s=e.chunkNames[0])||void 0===s?void 0:s.name)&&void 0!==n?n:le(e.id)}const Fr=/[?#]/;function zr(e,t,i){e in t&&i(function(e){return {code:me.FILE_NAME_CONFLICT,message:`The emitted file "${e}" overwrites a previously emitted file of the same name.`}}(e)),t[e]=jr;}const jr={type:"placeholder"};function Ur(e,t,i){if(!("string"==typeof e||e instanceof Uint8Array)){const e=t.fileName||t.name||i;return pe(Ae(`Could not set source for ${"string"==typeof e?`asset "${e}"`:"unnamed asset"}, asset source needs to be a string, Uint8Array or Buffer.`))}return e}function Gr(e,t){return "string"!=typeof e.fileName?pe((i=e.name||t,{code:me.ASSET_NOT_FINALISED,message:`Plugin error - Unable to get file name for asset "${i}". Ensure that the source is set and that generate is called first.`})):e.fileName;var i;}function Hr(e,t){var i;const s=e.fileName||e.module&&(null===(i=null==t?void 0:t.get(e.module))||void 0===i?void 0:i.id);return s||pe((n=e.fileName||e.name,{code:me.CHUNK_NOT_GENERATED,message:`Plugin error - Unable to get file name for chunk "${n}". Ensure that generate is called first.`}));var n;}class Wr{constructor(e,t,i){this.graph=e,this.options=t,this.bundle=null,this.facadeChunkByModule=null,this.outputOptions=null,this.assertAssetsFinalized=()=>{for(const[t,i]of this.filesByReferenceId)if("asset"===i.type&&"string"!=typeof i.fileName)return pe((e=i.name||t,{code:me.ASSET_SOURCE_MISSING,message:`Plugin error creating asset "${e}" - no asset source set.`}));var e;},this.emitFile=e=>function(e){return Boolean(e&&("asset"===e.type||"chunk"===e.type))}(e)?function(e){const t=e.fileName||e.name;return !t||"string"==typeof t&&!ce(t)}(e)?"chunk"===e.type?this.emitChunk(e):this.emitAsset(e):pe(Ae(`The "fileName" or "name" properties of emitted files must be strings that are neither absolute nor relative paths, received "${e.fileName||e.name}".`)):pe(Ae(`Emitted files must be of type "asset" or "chunk", received "${e&&e.type}".`)),this.getFileName=e=>{const t=this.filesByReferenceId.get(e);return t?"chunk"===t.type?Hr(t,this.facadeChunkByModule):Gr(t,e):pe((i=e,{code:me.FILE_NOT_FOUND,message:`Plugin error - Unable to get file name for unknown file "${i}".`}));var i;},this.setAssetSource=(e,t)=>{const i=this.filesByReferenceId.get(e);if(!i)return pe((s=e,{code:me.ASSET_NOT_FOUND,message:`Plugin error - Unable to set the source for unknown asset "${s}".`}));var s,n;if("asset"!==i.type)return pe(Ae(`Asset sources can only be set for emitted assets but "${e}" is an emitted chunk.`));if(void 0!==i.source)return pe((n=i.name||e,{code:me.ASSET_SOURCE_ALREADY_SET,message:`Unable to set the source for asset "${n}", source already set.`}));const r=Ur(t,i,e);this.bundle?this.finalizeAsset(i,r,e,this.bundle):i.source=r;},this.setOutputBundle=(e,t,i)=>{this.outputOptions=t,this.bundle=e,this.facadeChunkByModule=i;for(const e of this.filesByReferenceId.values())e.fileName&&zr(e.fileName,this.bundle,this.options.onwarn);for(const[e,t]of this.filesByReferenceId)"asset"===t.type&&void 0!==t.source&&this.finalizeAsset(t,t.source,e,this.bundle);},this.filesByReferenceId=i?new Map(i.filesByReferenceId):new Map;}assignReferenceId(e,t){let i;do{i=vr().update(i||t).digest("hex").substring(0,8);}while(this.filesByReferenceId.has(i));return this.filesByReferenceId.set(i,e),i}emitAsset(e){const t=void 0!==e.source?Ur(e.source,e,null):void 0,i={fileName:e.fileName,name:e.name,source:t,type:"asset"},s=this.assignReferenceId(i,e.fileName||e.name||e.type);return this.bundle&&(e.fileName&&zr(e.fileName,this.bundle,this.options.onwarn),void 0!==t&&this.finalizeAsset(i,t,s,this.bundle)),s}emitChunk(e){if(this.graph.phase>Gs.LOAD_AND_PARSE)return pe({code:me.INVALID_ROLLUP_PHASE,message:"Cannot emit chunks after module loading has finished."});if("string"!=typeof e.id)return pe(Ae(`Emitted chunks need to have a valid string id, received "${e.id}"`));const t={fileName:e.fileName,module:null,name:e.name||e.id,type:"chunk"};return this.graph.moduleLoader.emitChunk(e).then((e=>t.module=e)).catch((()=>{})),this.assignReferenceId(t,e.id)}finalizeAsset(e,t,i,s){const n=e.fileName||function(e,t){for(const[i,s]of Object.entries(e))if("asset"===s.type&&qr(t,s.source))return i;return null}(s,t)||function(e,t,i,s){const n=i.sanitizeFileName(e||"asset");return Mr(Rr("function"==typeof i.assetFileNames?i.assetFileNames({name:e,source:t,type:"asset"}):i.assetFileNames,"output.assetFileNames",{ext:()=>$(n).substring(1),extname:()=>$(n),hash:()=>vr().update(n).update(":").update(t).digest("hex").substring(0,8),name:()=>n.substring(0,n.length-$(n).length)}),s)}(e.name,t,this.outputOptions,s),r={...e,fileName:n,source:t};this.filesByReferenceId.set(i,r);const{options:a}=this;s[n]={fileName:n,get isAsset(){return ke('Accessing "isAsset" on files in the bundle is deprecated, please use "type === \'asset\'" instead',!0,a),!0},name:e.name,source:t,type:"asset"};}}function qr(e,t){if("string"==typeof e)return e===t;if("string"==typeof t)return !1;if("equals"in e)return e.equals(t);if(e.length!==t.length)return !1;for(let i=0;i<e.length;i++)if(e[i]!==t[i])return !1;return !0}const Kr=(e,t)=>t?`${e}\n${t}`:e,Xr=(e,t)=>t?`${e}\n\n${t}`:e;function Yr(e,t){const i=[],s=new Set(t.keys()),n=Object.create(null);for(const[e,i]of t){Qr(e,n[i]=n[i]||[],s);}for(const[e,t]of Object.entries(n))i.push({alias:e,modules:t});const r=new Map,{dependentEntryPointsByModule:a,dynamicEntryModules:o}=function(e){const t=new Set,i=new Map,s=new Set(e);for(const e of s){const n=new Set([e]);for(const r of n){R(i,r,(()=>new Set)).add(e);for(const e of r.getDependenciesToBeIncluded())e instanceof $e||n.add(e);for(const{resolution:e}of r.dynamicImports)e instanceof ln&&e.includedDynamicImporters.length>0&&(t.add(e),s.add(e));for(const e of r.implicitlyLoadedBefore)t.add(e),s.add(e);}}return {dependentEntryPointsByModule:i,dynamicEntryModules:t}}(e),l=function(e,t){const i=new Map;for(const s of t){const t=R(i,s,(()=>new Set));for(const i of [...s.includedDynamicImporters,...s.implicitlyLoadedAfter])for(const s of e.get(i))t.add(s);}return i}(a,o),h=new Set(e);function c(e,t){const i=new Set([e]);for(const n of i){const o=R(r,n,(()=>new Set));if(!t||!u(t,a.get(n))){o.add(e);for(const e of n.getDependenciesToBeIncluded())e instanceof $e||s.has(e)||i.add(e);}}}function u(e,t){const i=new Set(e);for(const e of i)if(!t.has(e)){if(h.has(e))return !1;const t=l.get(e);for(const e of t)i.add(e);}return !0}for(const t of e)s.has(t)||c(t,null);for(const e of o)s.has(e)||c(e,l.get(e));return i.push(...function(e,t){const i=Object.create(null);for(const[s,n]of t){let t="";for(const i of e)t+=n.has(i)?"X":"_";const r=i[t];r?r.push(s):i[t]=[s];}return Object.values(i).map((e=>({alias:null,modules:e})))}([...e,...o],r)),i}function Qr(e,t,i){const s=new Set([e]);for(const e of s){i.add(e),t.push(e);for(const t of e.dependencies)t instanceof $e||i.has(t)||s.add(t);}}const Zr=(e,t)=>e.execIndex>t.execIndex?1:-1;function Jr(e,t,i){const s=Symbol(e.id),n=[he(e.id)];let r=t;for(e.cycles.add(s);r!==e;)r.cycles.add(s),n.push(he(r.id)),r=i.get(r);return n.push(n[0]),n.reverse(),n}const ea=(e,t)=>t?`(${e})`:e,ta=/^(?!\d)[\w$]+$/;class ia{constructor(e,t,i,s,n){this.outputOptions=e,this.unsetOptions=t,this.inputOptions=i,this.pluginDriver=s,this.graph=n,this.facadeChunkByModule=new Map,this.includedNamespaces=new Set;}async generate(e){en("GENERATE",1);const t=Object.create(null);this.pluginDriver.setOutputBundle(t,this.outputOptions,this.facadeChunkByModule);try{await this.pluginDriver.hookParallel("renderStart",[this.outputOptions,this.inputOptions]),en("generate chunks",2);const e=await this.generateChunks();e.length>1&&function(e,t){if("umd"===e.format||"iife"===e.format)return pe(xe("output.format","outputformat","UMD and IIFE output formats are not supported for code-splitting builds",e.format));if("string"==typeof e.file)return pe(xe("output.file","outputdir",'when building multiple chunks, the "output.dir" option must be used, not "output.file". To inline dynamic imports, set the "inlineDynamicImports" option'));if(e.sourcemapFile)return pe(xe("output.sourcemapFile","outputsourcemapfile",'"output.sourcemapFile" is only supported for single-file builds'));!e.amd.autoId&&e.amd.id&&t(xe("output.amd.id","outputamd",'this option is only properly supported for single-file builds. Use "output.amd.autoId" and "output.amd.basePath" instead'));}(this.outputOptions,this.inputOptions.onwarn);const i=function(e){if(0===e.length)return "/";if(1===e.length)return N(e[0]);const t=e.slice(1).reduce(((e,t)=>{const i=t.split(/\/+|\\+/);let s;for(s=0;e[s]===i[s]&&s<Math.min(e.length,i.length);s++);return e.slice(0,s)}),e[0].split(/\/+|\\+/));return t.length>1?t.join("/"):"/"}(function(e){const t=[];for(const i of e)for(const e of i.entryModules)P(e.id)&&t.push(e.id);return t}(e));tn("generate chunks",2),en("render modules",2);const s=await async function(e,t){try{let[i,s,n,r]=await Promise.all([t.hookReduceValue("banner",e.banner(),[],Kr),t.hookReduceValue("footer",e.footer(),[],Kr),t.hookReduceValue("intro",e.intro(),[],Xr),t.hookReduceValue("outro",e.outro(),[],Xr)]);return n&&(n+="\n\n"),r&&(r=`\n\n${r}`),i.length&&(i+="\n"),s.length&&(s="\n"+s),{banner:i,footer:s,intro:n,outro:r}}catch(e){return pe({code:"ADDON_ERROR",message:`Could not retrieve ${e.hook}. Check configuration of plugin ${e.plugin}.\n\tError Message: ${e.message}`})}}(this.outputOptions,this.pluginDriver),n=function({compact:e,generatedCode:{arrowFunctions:t,constBindings:i,objectShorthand:s,reservedNamesAsProps:n}}){const{_:r,n:a,s:o}=e?{_:"",n:"",s:""}:{_:" ",n:"\n",s:";"},l=i?"const":"var",h=(e,{isAsync:t,name:i})=>`${t?"async ":""}function${i?` ${i}`:""}${r}(${e.join(`,${r}`)})${r}`,c=t?(e,{isAsync:t,name:i})=>{const s=1===e.length;return `${i?`${l} ${i}${r}=${r}`:""}${t?`async${s?" ":r}`:""}${s?e[0]:`(${e.join(`,${r}`)})`}${r}=>${r}`}:h,u=(e,{functionReturn:i,lineBreakIndent:s,name:n})=>[`${c(e,{isAsync:!1,name:n})}${t?s?`${a}${s.base}${s.t}`:"":`{${s?`${a}${s.base}${s.t}`:r}${i?"return ":""}`}`,t?`${n?";":""}${s?`${a}${s.base}`:""}`:`${o}${s?`${a}${s.base}`:r}}`],d=n?e=>ta.test(e):e=>!we.has(e)&&ta.test(e);return {_:r,cnst:l,getDirectReturnFunction:u,getDirectReturnIifeLeft:(e,i,{needsArrowReturnParens:s,needsWrappedFunction:n})=>{const[r,a]=u(e,{functionReturn:!0,lineBreakIndent:null,name:null});return `${ea(`${r}${ea(i,t&&s)}${a}`,t||n)}(`},getFunctionIntro:c,getNonArrowFunctionIntro:h,getObject(e,{lineBreakIndent:t}){const i=t?`${a}${t.base}${t.t}`:r;return `{${e.map((([e,t])=>{if(null===e)return `${i}${t}`;const n=!d(e);return e===t&&s&&!n?i+e:`${i}${n?`'${e}'`:e}:${r}${t}`})).join(",")}${0===e.length?"":t?`${a}${t.base}`:r}}`},getPropertyAccess:e=>d(e)?`.${e}`:`[${JSON.stringify(e)}]`,n:a,s:o}}(this.outputOptions);this.prerenderChunks(e,i,n),tn("render modules",2),await this.addFinalizedChunksToBundle(e,i,s,t,n);}catch(e){throw await this.pluginDriver.hookParallel("renderError",[e]),e}return await this.pluginDriver.hookSeq("generateBundle",[this.outputOptions,t,e]),this.finaliseAssets(t),tn("GENERATE",1),t}async addFinalizedChunksToBundle(e,t,i,s,n){this.assignChunkIds(e,t,i,s);for(const t of e)s[t.id]=t.getChunkInfoWithFileNames();await Promise.all(e.map((async e=>{const t=s[e.id];Object.assign(t,await e.render(this.outputOptions,i,t,n));})));}async addManualChunks(e){const t=new Map,i=await Promise.all(Object.entries(e).map((async([e,t])=>({alias:e,entries:await this.graph.moduleLoader.addAdditionalModules(t)}))));for(const{alias:e,entries:s}of i)for(const i of s)na(e,i,t);return t}assignChunkIds(e,t,i,s){const n=[],r=[];for(const t of e)(t.facadeModule&&t.facadeModule.isUserDefinedEntryPoint?n:r).push(t);const a=n.concat(r);for(const e of a)this.outputOptions.file?e.id=_(this.outputOptions.file):this.outputOptions.preserveModules?e.id=e.generateIdPreserveModules(t,this.outputOptions,s,this.unsetOptions):e.id=e.generateId(i,this.outputOptions,s,!0),s[e.id]=jr;}assignManualChunks(e){const t=[],i={getModuleIds:()=>this.graph.modulesById.keys(),getModuleInfo:this.graph.getModuleInfo};for(const s of this.graph.modulesById.values())if(s instanceof ln){const n=e(s.id,i);"string"==typeof n&&t.push([n,s]);}t.sort((([e],[t])=>e>t?1:e<t?-1:0));const s=new Map;for(const[e,i]of t)na(e,i,s);return s}finaliseAssets(e){for(const t of Object.values(e))if(t.type||(ke('A plugin is directly adding properties to the bundle object in the "generateBundle" hook. This is deprecated and will be removed in a future Rollup version, please use "this.emitFile" instead.',!0,this.inputOptions),t.type="asset"),this.outputOptions.validate&&"code"in t)try{this.graph.contextParse(t.code,{allowHashBang:!0,ecmaVersion:"latest"});}catch(e){this.inputOptions.onwarn(ge(t,e));}this.pluginDriver.finaliseAssets();}async generateChunks(){const{manualChunks:e}=this.outputOptions,t="object"==typeof e?await this.addManualChunks(e):this.assignManualChunks(e),i=[],s=new Map;for(const{alias:e,modules:n}of this.outputOptions.inlineDynamicImports?[{alias:null,modules:sa(this.graph.modulesById)}]:this.outputOptions.preserveModules?sa(this.graph.modulesById).map((e=>({alias:null,modules:[e]}))):Yr(this.graph.entryModules,t)){n.sort(Zr);const t=new Vr(n,this.inputOptions,this.outputOptions,this.unsetOptions,this.pluginDriver,this.graph.modulesById,s,this.facadeChunkByModule,this.includedNamespaces,e);i.push(t);for(const e of n)s.set(e,t);}for(const e of i)e.link();const n=[];for(const e of i)n.push(...e.generateFacades());return [...i,...n]}prerenderChunks(e,t,i){for(const t of e)t.generateExports();for(const s of e)s.preRender(this.outputOptions,t,i);}}function sa(e){return [...e.values()].filter((e=>e instanceof ln&&(e.isIncluded()||e.info.isEntry||e.includedDynamicImporters.length>0)))}function na(e,t,i){const s=i.get(t);if("string"==typeof s&&s!==e)return pe((n=t.id,r=e,a=s,{code:me.INVALID_CHUNK,message:`Cannot assign ${he(n)} to the "${r}" chunk as it is already in the "${a}" chunk.`}));var n,r,a;i.set(t,e);}var ra=[509,0,227,0,150,4,294,9,1368,2,2,1,6,3,41,2,5,0,166,1,574,3,9,9,370,1,154,10,50,3,123,2,54,14,32,10,3,1,11,3,46,10,8,0,46,9,7,2,37,13,2,9,6,1,45,0,13,2,49,13,9,3,2,11,83,11,7,0,161,11,6,9,7,3,56,1,2,6,3,1,3,2,10,0,11,1,3,6,4,4,193,17,10,9,5,0,82,19,13,9,214,6,3,8,28,1,83,16,16,9,82,12,9,9,84,14,5,9,243,14,166,9,71,5,2,1,3,3,2,0,2,1,13,9,120,6,3,6,4,0,29,9,41,6,2,3,9,0,10,10,47,15,406,7,2,7,17,9,57,21,2,13,123,5,4,0,2,1,2,6,2,0,9,9,49,4,2,1,2,4,9,9,330,3,19306,9,87,9,39,4,60,6,26,9,1014,0,2,54,8,3,82,0,12,1,19628,1,4706,45,3,22,543,4,4,5,9,7,3,6,31,3,149,2,1418,49,513,54,5,49,9,0,15,0,23,4,2,14,1361,6,2,16,3,6,2,1,2,4,262,6,10,9,357,0,62,13,1495,6,110,6,6,9,4759,9,787719,239],aa=[0,11,2,25,2,18,2,1,2,14,3,13,35,122,70,52,268,28,4,48,48,31,14,29,6,37,11,29,3,35,5,7,2,4,43,157,19,35,5,35,5,39,9,51,13,10,2,14,2,6,2,1,2,10,2,14,2,6,2,1,68,310,10,21,11,7,25,5,2,41,2,8,70,5,3,0,2,43,2,1,4,0,3,22,11,22,10,30,66,18,2,1,11,21,11,25,71,55,7,1,65,0,16,3,2,2,2,28,43,28,4,28,36,7,2,27,28,53,11,21,11,18,14,17,111,72,56,50,14,50,14,35,349,41,7,1,79,28,11,0,9,21,43,17,47,20,28,22,13,52,58,1,3,0,14,44,33,24,27,35,30,0,3,0,9,34,4,0,13,47,15,3,22,0,2,0,36,17,2,24,85,6,2,0,2,3,2,14,2,9,8,46,39,7,3,1,3,21,2,6,2,1,2,4,4,0,19,0,13,4,159,52,19,3,21,2,31,47,21,1,2,0,185,46,42,3,37,47,21,0,60,42,14,0,72,26,38,6,186,43,117,63,32,7,3,0,3,7,2,1,2,23,16,0,2,0,95,7,3,38,17,0,2,0,29,0,11,39,8,0,22,0,12,45,20,0,19,72,264,8,2,36,18,0,50,29,113,6,2,1,2,37,22,0,26,5,2,1,2,31,15,0,328,18,190,0,80,921,103,110,18,195,2637,96,16,1070,4050,582,8634,568,8,30,18,78,18,29,19,47,17,3,32,20,6,18,689,63,129,74,6,0,67,12,65,1,2,0,29,6135,9,1237,43,8,8936,3,2,6,2,1,2,290,46,2,18,3,9,395,2309,106,6,12,4,8,8,9,5991,84,2,70,2,1,3,0,3,1,3,3,2,11,2,0,2,6,2,64,2,3,3,7,2,6,2,27,2,3,2,4,2,0,4,6,2,339,3,24,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,7,1845,30,482,44,11,6,17,0,322,29,19,43,1269,6,2,3,2,1,2,14,2,196,60,67,8,0,1205,3,2,26,2,1,2,0,3,0,2,9,2,3,2,0,2,0,7,0,5,0,2,0,2,0,2,2,2,1,2,0,3,0,2,0,2,0,2,0,2,0,2,1,2,0,3,3,2,6,2,3,2,3,2,0,2,9,2,16,6,2,2,4,2,16,4421,42719,33,4152,8,221,3,5761,15,7472,3104,541,1507,4938],oa="ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙՠ-ֈא-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࡰ-ࢇࢉ-ࢎࢠ-ࣉऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚౝౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽೝೞೠೡೱೲഄ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜑᜟ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭌᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲈᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿₐ-ₜℂℇℊ-ℓℕ℘-ℝℤΩℨK-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞ々-〇〡-〩〱-〵〸-〼ぁ-ゖ゛-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-ꟊꟐꟑꟓꟕ-ꟙꟲ-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ",la={3:"abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",5:"class enum extends super const export import",6:"enum",strict:"implements interface let package private protected public static yield",strictBind:"eval arguments"},ha="break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this",ca={5:ha,"5module":ha+" export import",6:ha+" const class extends export import super"},ua=/^in(stanceof)?$/,da=new RegExp("["+oa+"]"),pa=new RegExp("["+oa+"‌‍·̀-ͯ·҃-֑҇-ׇֽֿׁׂׅׄؐ-ًؚ-٩ٰۖ-ۜ۟-۪ۤۧۨ-ۭ۰-۹ܑܰ-݊ަ-ް߀-߉߫-߽߳ࠖ-࠙ࠛ-ࠣࠥ-ࠧࠩ-࡙࠭-࡛࢘-࢟࣊-ࣣ࣡-ःऺ-़ा-ॏ॑-ॗॢॣ०-९ঁ-ঃ়া-ৄেৈো-্ৗৢৣ০-৯৾ਁ-ਃ਼ਾ-ੂੇੈੋ-੍ੑ੦-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢૣ૦-૯ૺ-૿ଁ-ଃ଼ା-ୄେୈୋ-୍୕-ୗୢୣ୦-୯ஂா-ூெ-ைொ-்ௗ௦-௯ఀ-ఄ఼ా-ౄె-ైొ-్ౕౖౢౣ౦-౯ಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕೖೢೣ೦-೯ഀ-ഃ഻഼ാ-ൄെ-ൈൊ-്ൗൢൣ൦-൯ඁ-ඃ්ා-ුූෘ-ෟ෦-෯ෲෳัิ-ฺ็-๎๐-๙ັິ-ຼ່-ໍ໐-໙༘༙༠-༩༹༵༷༾༿ཱ-྄྆྇ྍ-ྗྙ-ྼ࿆ါ-ှ၀-၉ၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏ-ႝ፝-፟፩-፱ᜒ-᜕ᜲ-᜴ᝒᝓᝲᝳ឴-៓៝០-៩᠋-᠍᠏-᠙ᢩᤠ-ᤫᤰ-᤻᥆-᥏᧐-᧚ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼-᪉᪐-᪙᪰-᪽ᪿ-ᫎᬀ-ᬄ᬴-᭄᭐-᭙᭫-᭳ᮀ-ᮂᮡ-ᮭ᮰-᮹᯦-᯳ᰤ-᰷᱀-᱉᱐-᱙᳐-᳔᳒-᳨᳭᳴᳷-᳹᷀-᷿‿⁀⁔⃐-⃥⃜⃡-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙゚〯꘠-꘩꙯ꙴ-꙽ꚞꚟ꛰꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀꢁꢴ-ꣅ꣐-꣙꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꦀ-ꦃ꦳-꧀꧐-꧙ꧥ꧰-꧹ꨩ-ꨶꩃꩌꩍ꩐-꩙ꩻ-ꩽꪰꪲ-ꪴꪷꪸꪾ꪿꫁ꫫ-ꫯꫵ꫶ꯣ-ꯪ꯬꯭꯰-꯹ﬞ︀-️︠-︯︳︴﹍-﹏０-９＿]");function fa(e,t){for(var i=65536,s=0;s<t.length;s+=2){if((i+=t[s])>e)return !1;if((i+=t[s+1])>=e)return !0}}function ma(e,t){return e<65?36===e:e<91||(e<97?95===e:e<123||(e<=65535?e>=170&&da.test(String.fromCharCode(e)):!1!==t&&fa(e,aa)))}function ga(e,t){return e<48?36===e:e<58||!(e<65)&&(e<91||(e<97?95===e:e<123||(e<=65535?e>=170&&pa.test(String.fromCharCode(e)):!1!==t&&(fa(e,aa)||fa(e,ra)))))}var ya=function(e,t){void 0===t&&(t={}),this.label=e,this.keyword=t.keyword,this.beforeExpr=!!t.beforeExpr,this.startsExpr=!!t.startsExpr,this.isLoop=!!t.isLoop,this.isAssign=!!t.isAssign,this.prefix=!!t.prefix,this.postfix=!!t.postfix,this.binop=t.binop||null,this.updateContext=null;};function xa(e,t){return new ya(e,{beforeExpr:!0,binop:t})}var Ea={beforeExpr:!0},ba={startsExpr:!0},va={};function Sa(e,t){return void 0===t&&(t={}),t.keyword=e,va[e]=new ya(e,t)}var Aa={num:new ya("num",ba),regexp:new ya("regexp",ba),string:new ya("string",ba),name:new ya("name",ba),privateId:new ya("privateId",ba),eof:new ya("eof"),bracketL:new ya("[",{beforeExpr:!0,startsExpr:!0}),bracketR:new ya("]"),braceL:new ya("{",{beforeExpr:!0,startsExpr:!0}),braceR:new ya("}"),parenL:new ya("(",{beforeExpr:!0,startsExpr:!0}),parenR:new ya(")"),comma:new ya(",",Ea),semi:new ya(";",Ea),colon:new ya(":",Ea),dot:new ya("."),question:new ya("?",Ea),questionDot:new ya("?."),arrow:new ya("=>",Ea),template:new ya("template"),invalidTemplate:new ya("invalidTemplate"),ellipsis:new ya("...",Ea),backQuote:new ya("`",ba),dollarBraceL:new ya("${",{beforeExpr:!0,startsExpr:!0}),eq:new ya("=",{beforeExpr:!0,isAssign:!0}),assign:new ya("_=",{beforeExpr:!0,isAssign:!0}),incDec:new ya("++/--",{prefix:!0,postfix:!0,startsExpr:!0}),prefix:new ya("!/~",{beforeExpr:!0,prefix:!0,startsExpr:!0}),logicalOR:xa("||",1),logicalAND:xa("&&",2),bitwiseOR:xa("|",3),bitwiseXOR:xa("^",4),bitwiseAND:xa("&",5),equality:xa("==/!=/===/!==",6),relational:xa("</>/<=/>=",7),bitShift:xa("<</>>/>>>",8),plusMin:new ya("+/-",{beforeExpr:!0,binop:9,prefix:!0,startsExpr:!0}),modulo:xa("%",10),star:xa("*",10),slash:xa("/",10),starstar:new ya("**",{beforeExpr:!0}),coalesce:xa("??",1),_break:Sa("break"),_case:Sa("case",Ea),_catch:Sa("catch"),_continue:Sa("continue"),_debugger:Sa("debugger"),_default:Sa("default",Ea),_do:Sa("do",{isLoop:!0,beforeExpr:!0}),_else:Sa("else",Ea),_finally:Sa("finally"),_for:Sa("for",{isLoop:!0}),_function:Sa("function",ba),_if:Sa("if"),_return:Sa("return",Ea),_switch:Sa("switch"),_throw:Sa("throw",Ea),_try:Sa("try"),_var:Sa("var"),_const:Sa("const"),_while:Sa("while",{isLoop:!0}),_with:Sa("with"),_new:Sa("new",{beforeExpr:!0,startsExpr:!0}),_this:Sa("this",ba),_super:Sa("super",ba),_class:Sa("class",ba),_extends:Sa("extends",Ea),_export:Sa("export"),_import:Sa("import",ba),_null:Sa("null",ba),_true:Sa("true",ba),_false:Sa("false",ba),_in:Sa("in",{beforeExpr:!0,binop:7}),_instanceof:Sa("instanceof",{beforeExpr:!0,binop:7}),_typeof:Sa("typeof",{beforeExpr:!0,prefix:!0,startsExpr:!0}),_void:Sa("void",{beforeExpr:!0,prefix:!0,startsExpr:!0}),_delete:Sa("delete",{beforeExpr:!0,prefix:!0,startsExpr:!0})},Ia=/\r\n?|\n|\u2028|\u2029/,ka=new RegExp(Ia.source,"g");function Pa(e){return 10===e||13===e||8232===e||8233===e}function wa(e,t,i){void 0===i&&(i=e.length);for(var s=t;s<i;s++){var n=e.charCodeAt(s);if(Pa(n))return s<i-1&&13===n&&10===e.charCodeAt(s+1)?s+2:s+1}return -1}var Ca=/[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/,_a=/(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g,Na=Object.prototype,$a=Na.hasOwnProperty,Ta=Na.toString,Oa=Object.hasOwn||function(e,t){return $a.call(e,t)},Ra=Array.isArray||function(e){return "[object Array]"===Ta.call(e)};function Ma(e){return new RegExp("^(?:"+e.replace(/ /g,"|")+")$")}function Da(e){return e<=65535?String.fromCharCode(e):(e-=65536,String.fromCharCode(55296+(e>>10),56320+(1023&e)))}var La=/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/,Va=function(e,t){this.line=e,this.column=t;};Va.prototype.offset=function(e){return new Va(this.line,this.column+e)};var Ba=function(e,t,i){this.start=t,this.end=i,null!==e.sourceFile&&(this.source=e.sourceFile);};function Fa(e,t){for(var i=1,s=0;;){var n=wa(e,s,t);if(n<0)return new Va(i,t-s);++i,s=n;}}var za={ecmaVersion:null,sourceType:"script",onInsertedSemicolon:null,onTrailingComma:null,allowReserved:null,allowReturnOutsideFunction:!1,allowImportExportEverywhere:!1,allowAwaitOutsideFunction:null,allowSuperOutsideMethod:null,allowHashBang:!1,locations:!1,onToken:null,onComment:null,ranges:!1,program:null,sourceFile:null,directSourceFile:null,preserveParens:!1},ja=!1;function Ua(e){var t={};for(var i in za)t[i]=e&&Oa(e,i)?e[i]:za[i];if("latest"===t.ecmaVersion?t.ecmaVersion=1e8:null==t.ecmaVersion?(!ja&&"object"==typeof console&&console.warn&&(ja=!0,console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.")),t.ecmaVersion=11):t.ecmaVersion>=2015&&(t.ecmaVersion-=2009),null==t.allowReserved&&(t.allowReserved=t.ecmaVersion<5),Ra(t.onToken)){var s=t.onToken;t.onToken=function(e){return s.push(e)};}return Ra(t.onComment)&&(t.onComment=function(e,t){return function(i,s,n,r,a,o){var l={type:i?"Block":"Line",value:s,start:n,end:r};e.locations&&(l.loc=new Ba(this,a,o)),e.ranges&&(l.range=[n,r]),t.push(l);}}(t,t.onComment)),t}function Ga(e,t){return 2|(e?4:0)|(t?8:0)}var Ha=function(e,t,i){this.options=e=Ua(e),this.sourceFile=e.sourceFile,this.keywords=Ma(ca[e.ecmaVersion>=6?6:"module"===e.sourceType?"5module":5]);var s="";!0!==e.allowReserved&&(s=la[e.ecmaVersion>=6?6:5===e.ecmaVersion?5:3],"module"===e.sourceType&&(s+=" await")),this.reservedWords=Ma(s);var n=(s?s+" ":"")+la.strict;this.reservedWordsStrict=Ma(n),this.reservedWordsStrictBind=Ma(n+" "+la.strictBind),this.input=String(t),this.containsEsc=!1,i?(this.pos=i,this.lineStart=this.input.lastIndexOf("\n",i-1)+1,this.curLine=this.input.slice(0,this.lineStart).split(Ia).length):(this.pos=this.lineStart=0,this.curLine=1),this.type=Aa.eof,this.value=null,this.start=this.end=this.pos,this.startLoc=this.endLoc=this.curPosition(),this.lastTokEndLoc=this.lastTokStartLoc=null,this.lastTokStart=this.lastTokEnd=this.pos,this.context=this.initialContext(),this.exprAllowed=!0,this.inModule="module"===e.sourceType,this.strict=this.inModule||this.strictDirective(this.pos),this.potentialArrowAt=-1,this.potentialArrowInForAwait=!1,this.yieldPos=this.awaitPos=this.awaitIdentPos=0,this.labels=[],this.undefinedExports=Object.create(null),0===this.pos&&e.allowHashBang&&"#!"===this.input.slice(0,2)&&this.skipLineComment(2),this.scopeStack=[],this.enterScope(1),this.regexpState=null,this.privateNameStack=[];},Wa={inFunction:{configurable:!0},inGenerator:{configurable:!0},inAsync:{configurable:!0},canAwait:{configurable:!0},allowSuper:{configurable:!0},allowDirectSuper:{configurable:!0},treatFunctionsAsVar:{configurable:!0},allowNewDotTarget:{configurable:!0},inClassStaticBlock:{configurable:!0}};Ha.prototype.parse=function(){var e=this.options.program||this.startNode();return this.nextToken(),this.parseTopLevel(e)},Wa.inFunction.get=function(){return (2&this.currentVarScope().flags)>0},Wa.inGenerator.get=function(){return (8&this.currentVarScope().flags)>0&&!this.currentVarScope().inClassFieldInit},Wa.inAsync.get=function(){return (4&this.currentVarScope().flags)>0&&!this.currentVarScope().inClassFieldInit},Wa.canAwait.get=function(){for(var e=this.scopeStack.length-1;e>=0;e--){var t=this.scopeStack[e];if(t.inClassFieldInit||256&t.flags)return !1;if(2&t.flags)return (4&t.flags)>0}return this.inModule&&this.options.ecmaVersion>=13||this.options.allowAwaitOutsideFunction},Wa.allowSuper.get=function(){var e=this.currentThisScope(),t=e.flags,i=e.inClassFieldInit;return (64&t)>0||i||this.options.allowSuperOutsideMethod},Wa.allowDirectSuper.get=function(){return (128&this.currentThisScope().flags)>0},Wa.treatFunctionsAsVar.get=function(){return this.treatFunctionsAsVarInScope(this.currentScope())},Wa.allowNewDotTarget.get=function(){var e=this.currentThisScope(),t=e.flags,i=e.inClassFieldInit;return (258&t)>0||i},Wa.inClassStaticBlock.get=function(){return (256&this.currentVarScope().flags)>0},Ha.extend=function(){for(var e=[],t=arguments.length;t--;)e[t]=arguments[t];for(var i=this,s=0;s<e.length;s++)i=e[s](i);return i},Ha.parse=function(e,t){return new this(t,e).parse()},Ha.parseExpressionAt=function(e,t,i){var s=new this(i,e,t);return s.nextToken(),s.parseExpression()},Ha.tokenizer=function(e,t){return new this(t,e)},Object.defineProperties(Ha.prototype,Wa);var qa=Ha.prototype,Ka=/^(?:'((?:\\.|[^'\\])*?)'|"((?:\\.|[^"\\])*?)")/;qa.strictDirective=function(e){if(this.options.ecmaVersion<5)return !1;for(;;){_a.lastIndex=e,e+=_a.exec(this.input)[0].length;var t=Ka.exec(this.input.slice(e));if(!t)return !1;if("use strict"===(t[1]||t[2])){_a.lastIndex=e+t[0].length;var i=_a.exec(this.input),s=i.index+i[0].length,n=this.input.charAt(s);return ";"===n||"}"===n||Ia.test(i[0])&&!(/[(`.[+\-/*%<>=,?^&]/.test(n)||"!"===n&&"="===this.input.charAt(s+1))}e+=t[0].length,_a.lastIndex=e,e+=_a.exec(this.input)[0].length,";"===this.input[e]&&e++;}},qa.eat=function(e){return this.type===e&&(this.next(),!0)},qa.isContextual=function(e){return this.type===Aa.name&&this.value===e&&!this.containsEsc},qa.eatContextual=function(e){return !!this.isContextual(e)&&(this.next(),!0)},qa.expectContextual=function(e){this.eatContextual(e)||this.unexpected();},qa.canInsertSemicolon=function(){return this.type===Aa.eof||this.type===Aa.braceR||Ia.test(this.input.slice(this.lastTokEnd,this.start))},qa.insertSemicolon=function(){if(this.canInsertSemicolon())return this.options.onInsertedSemicolon&&this.options.onInsertedSemicolon(this.lastTokEnd,this.lastTokEndLoc),!0},qa.semicolon=function(){this.eat(Aa.semi)||this.insertSemicolon()||this.unexpected();},qa.afterTrailingComma=function(e,t){if(this.type===e)return this.options.onTrailingComma&&this.options.onTrailingComma(this.lastTokStart,this.lastTokStartLoc),t||this.next(),!0},qa.expect=function(e){this.eat(e)||this.unexpected();},qa.unexpected=function(e){this.raise(null!=e?e:this.start,"Unexpected token");};var Xa=function(){this.shorthandAssign=this.trailingComma=this.parenthesizedAssign=this.parenthesizedBind=this.doubleProto=-1;};qa.checkPatternErrors=function(e,t){if(e){e.trailingComma>-1&&this.raiseRecoverable(e.trailingComma,"Comma is not permitted after the rest element");var i=t?e.parenthesizedAssign:e.parenthesizedBind;i>-1&&this.raiseRecoverable(i,"Parenthesized pattern");}},qa.checkExpressionErrors=function(e,t){if(!e)return !1;var i=e.shorthandAssign,s=e.doubleProto;if(!t)return i>=0||s>=0;i>=0&&this.raise(i,"Shorthand property assignments are valid only in destructuring patterns"),s>=0&&this.raiseRecoverable(s,"Redefinition of __proto__ property");},qa.checkYieldAwaitInDefaultParams=function(){this.yieldPos&&(!this.awaitPos||this.yieldPos<this.awaitPos)&&this.raise(this.yieldPos,"Yield expression cannot be a default value"),this.awaitPos&&this.raise(this.awaitPos,"Await expression cannot be a default value");},qa.isSimpleAssignTarget=function(e){return "ParenthesizedExpression"===e.type?this.isSimpleAssignTarget(e.expression):"Identifier"===e.type||"MemberExpression"===e.type};var Ya=Ha.prototype;Ya.parseTopLevel=function(e){var t=Object.create(null);for(e.body||(e.body=[]);this.type!==Aa.eof;){var i=this.parseStatement(null,!0,t);e.body.push(i);}if(this.inModule)for(var s=0,n=Object.keys(this.undefinedExports);s<n.length;s+=1){var r=n[s];this.raiseRecoverable(this.undefinedExports[r].start,"Export '"+r+"' is not defined");}return this.adaptDirectivePrologue(e.body),this.next(),e.sourceType=this.options.sourceType,this.finishNode(e,"Program")};var Qa={kind:"loop"},Za={kind:"switch"};Ya.isLet=function(e){if(this.options.ecmaVersion<6||!this.isContextual("let"))return !1;_a.lastIndex=this.pos;var t=_a.exec(this.input),i=this.pos+t[0].length,s=this.input.charCodeAt(i);if(91===s||92===s||s>55295&&s<56320)return !0;if(e)return !1;if(123===s)return !0;if(ma(s,!0)){for(var n=i+1;ga(s=this.input.charCodeAt(n),!0);)++n;if(92===s||s>55295&&s<56320)return !0;var r=this.input.slice(i,n);if(!ua.test(r))return !0}return !1},Ya.isAsyncFunction=function(){if(this.options.ecmaVersion<8||!this.isContextual("async"))return !1;_a.lastIndex=this.pos;var e,t=_a.exec(this.input),i=this.pos+t[0].length;return !(Ia.test(this.input.slice(this.pos,i))||"function"!==this.input.slice(i,i+8)||i+8!==this.input.length&&(ga(e=this.input.charCodeAt(i+8))||e>55295&&e<56320))},Ya.parseStatement=function(e,t,i){var s,n=this.type,r=this.startNode();switch(this.isLet(e)&&(n=Aa._var,s="let"),n){case Aa._break:case Aa._continue:return this.parseBreakContinueStatement(r,n.keyword);case Aa._debugger:return this.parseDebuggerStatement(r);case Aa._do:return this.parseDoStatement(r);case Aa._for:return this.parseForStatement(r);case Aa._function:return e&&(this.strict||"if"!==e&&"label"!==e)&&this.options.ecmaVersion>=6&&this.unexpected(),this.parseFunctionStatement(r,!1,!e);case Aa._class:return e&&this.unexpected(),this.parseClass(r,!0);case Aa._if:return this.parseIfStatement(r);case Aa._return:return this.parseReturnStatement(r);case Aa._switch:return this.parseSwitchStatement(r);case Aa._throw:return this.parseThrowStatement(r);case Aa._try:return this.parseTryStatement(r);case Aa._const:case Aa._var:return s=s||this.value,e&&"var"!==s&&this.unexpected(),this.parseVarStatement(r,s);case Aa._while:return this.parseWhileStatement(r);case Aa._with:return this.parseWithStatement(r);case Aa.braceL:return this.parseBlock(!0,r);case Aa.semi:return this.parseEmptyStatement(r);case Aa._export:case Aa._import:if(this.options.ecmaVersion>10&&n===Aa._import){_a.lastIndex=this.pos;var a=_a.exec(this.input),o=this.pos+a[0].length,l=this.input.charCodeAt(o);if(40===l||46===l)return this.parseExpressionStatement(r,this.parseExpression())}return this.options.allowImportExportEverywhere||(t||this.raise(this.start,"'import' and 'export' may only appear at the top level"),this.inModule||this.raise(this.start,"'import' and 'export' may appear only with 'sourceType: module'")),n===Aa._import?this.parseImport(r):this.parseExport(r,i);default:if(this.isAsyncFunction())return e&&this.unexpected(),this.next(),this.parseFunctionStatement(r,!0,!e);var h=this.value,c=this.parseExpression();return n===Aa.name&&"Identifier"===c.type&&this.eat(Aa.colon)?this.parseLabeledStatement(r,h,c,e):this.parseExpressionStatement(r,c)}},Ya.parseBreakContinueStatement=function(e,t){var i="break"===t;this.next(),this.eat(Aa.semi)||this.insertSemicolon()?e.label=null:this.type!==Aa.name?this.unexpected():(e.label=this.parseIdent(),this.semicolon());for(var s=0;s<this.labels.length;++s){var n=this.labels[s];if(null==e.label||n.name===e.label.name){if(null!=n.kind&&(i||"loop"===n.kind))break;if(e.label&&i)break}}return s===this.labels.length&&this.raise(e.start,"Unsyntactic "+t),this.finishNode(e,i?"BreakStatement":"ContinueStatement")},Ya.parseDebuggerStatement=function(e){return this.next(),this.semicolon(),this.finishNode(e,"DebuggerStatement")},Ya.parseDoStatement=function(e){return this.next(),this.labels.push(Qa),e.body=this.parseStatement("do"),this.labels.pop(),this.expect(Aa._while),e.test=this.parseParenExpression(),this.options.ecmaVersion>=6?this.eat(Aa.semi):this.semicolon(),this.finishNode(e,"DoWhileStatement")},Ya.parseForStatement=function(e){this.next();var t=this.options.ecmaVersion>=9&&this.canAwait&&this.eatContextual("await")?this.lastTokStart:-1;if(this.labels.push(Qa),this.enterScope(0),this.expect(Aa.parenL),this.type===Aa.semi)return t>-1&&this.unexpected(t),this.parseFor(e,null);var i=this.isLet();if(this.type===Aa._var||this.type===Aa._const||i){var s=this.startNode(),n=i?"let":this.value;return this.next(),this.parseVar(s,!0,n),this.finishNode(s,"VariableDeclaration"),(this.type===Aa._in||this.options.ecmaVersion>=6&&this.isContextual("of"))&&1===s.declarations.length?(this.options.ecmaVersion>=9&&(this.type===Aa._in?t>-1&&this.unexpected(t):e.await=t>-1),this.parseForIn(e,s)):(t>-1&&this.unexpected(t),this.parseFor(e,s))}var r=this.isContextual("let"),a=!1,o=new Xa,l=this.parseExpression(!(t>-1)||"await",o);return this.type===Aa._in||(a=this.options.ecmaVersion>=6&&this.isContextual("of"))?(this.options.ecmaVersion>=9&&(this.type===Aa._in?t>-1&&this.unexpected(t):e.await=t>-1),r&&a&&this.raise(l.start,"The left-hand side of a for-of loop may not start with 'let'."),this.toAssignable(l,!1,o),this.checkLValPattern(l),this.parseForIn(e,l)):(this.checkExpressionErrors(o,!0),t>-1&&this.unexpected(t),this.parseFor(e,l))},Ya.parseFunctionStatement=function(e,t,i){return this.next(),this.parseFunction(e,eo|(i?0:to),!1,t)},Ya.parseIfStatement=function(e){return this.next(),e.test=this.parseParenExpression(),e.consequent=this.parseStatement("if"),e.alternate=this.eat(Aa._else)?this.parseStatement("if"):null,this.finishNode(e,"IfStatement")},Ya.parseReturnStatement=function(e){return this.inFunction||this.options.allowReturnOutsideFunction||this.raise(this.start,"'return' outside of function"),this.next(),this.eat(Aa.semi)||this.insertSemicolon()?e.argument=null:(e.argument=this.parseExpression(),this.semicolon()),this.finishNode(e,"ReturnStatement")},Ya.parseSwitchStatement=function(e){var t;this.next(),e.discriminant=this.parseParenExpression(),e.cases=[],this.expect(Aa.braceL),this.labels.push(Za),this.enterScope(0);for(var i=!1;this.type!==Aa.braceR;)if(this.type===Aa._case||this.type===Aa._default){var s=this.type===Aa._case;t&&this.finishNode(t,"SwitchCase"),e.cases.push(t=this.startNode()),t.consequent=[],this.next(),s?t.test=this.parseExpression():(i&&this.raiseRecoverable(this.lastTokStart,"Multiple default clauses"),i=!0,t.test=null),this.expect(Aa.colon);}else t||this.unexpected(),t.consequent.push(this.parseStatement(null));return this.exitScope(),t&&this.finishNode(t,"SwitchCase"),this.next(),this.labels.pop(),this.finishNode(e,"SwitchStatement")},Ya.parseThrowStatement=function(e){return this.next(),Ia.test(this.input.slice(this.lastTokEnd,this.start))&&this.raise(this.lastTokEnd,"Illegal newline after throw"),e.argument=this.parseExpression(),this.semicolon(),this.finishNode(e,"ThrowStatement")};var Ja=[];Ya.parseTryStatement=function(e){if(this.next(),e.block=this.parseBlock(),e.handler=null,this.type===Aa._catch){var t=this.startNode();if(this.next(),this.eat(Aa.parenL)){t.param=this.parseBindingAtom();var i="Identifier"===t.param.type;this.enterScope(i?32:0),this.checkLValPattern(t.param,i?4:2),this.expect(Aa.parenR);}else this.options.ecmaVersion<10&&this.unexpected(),t.param=null,this.enterScope(0);t.body=this.parseBlock(!1),this.exitScope(),e.handler=this.finishNode(t,"CatchClause");}return e.finalizer=this.eat(Aa._finally)?this.parseBlock():null,e.handler||e.finalizer||this.raise(e.start,"Missing catch or finally clause"),this.finishNode(e,"TryStatement")},Ya.parseVarStatement=function(e,t){return this.next(),this.parseVar(e,!1,t),this.semicolon(),this.finishNode(e,"VariableDeclaration")},Ya.parseWhileStatement=function(e){return this.next(),e.test=this.parseParenExpression(),this.labels.push(Qa),e.body=this.parseStatement("while"),this.labels.pop(),this.finishNode(e,"WhileStatement")},Ya.parseWithStatement=function(e){return this.strict&&this.raise(this.start,"'with' in strict mode"),this.next(),e.object=this.parseParenExpression(),e.body=this.parseStatement("with"),this.finishNode(e,"WithStatement")},Ya.parseEmptyStatement=function(e){return this.next(),this.finishNode(e,"EmptyStatement")},Ya.parseLabeledStatement=function(e,t,i,s){for(var n=0,r=this.labels;n<r.length;n+=1){r[n].name===t&&this.raise(i.start,"Label '"+t+"' is already declared");}for(var a=this.type.isLoop?"loop":this.type===Aa._switch?"switch":null,o=this.labels.length-1;o>=0;o--){var l=this.labels[o];if(l.statementStart!==e.start)break;l.statementStart=this.start,l.kind=a;}return this.labels.push({name:t,kind:a,statementStart:this.start}),e.body=this.parseStatement(s?-1===s.indexOf("label")?s+"label":s:"label"),this.labels.pop(),e.label=i,this.finishNode(e,"LabeledStatement")},Ya.parseExpressionStatement=function(e,t){return e.expression=t,this.semicolon(),this.finishNode(e,"ExpressionStatement")},Ya.parseBlock=function(e,t,i){for(void 0===e&&(e=!0),void 0===t&&(t=this.startNode()),t.body=[],this.expect(Aa.braceL),e&&this.enterScope(0);this.type!==Aa.braceR;){var s=this.parseStatement(null);t.body.push(s);}return i&&(this.strict=!1),this.next(),e&&this.exitScope(),this.finishNode(t,"BlockStatement")},Ya.parseFor=function(e,t){return e.init=t,this.expect(Aa.semi),e.test=this.type===Aa.semi?null:this.parseExpression(),this.expect(Aa.semi),e.update=this.type===Aa.parenR?null:this.parseExpression(),this.expect(Aa.parenR),e.body=this.parseStatement("for"),this.exitScope(),this.labels.pop(),this.finishNode(e,"ForStatement")},Ya.parseForIn=function(e,t){var i=this.type===Aa._in;return this.next(),"VariableDeclaration"===t.type&&null!=t.declarations[0].init&&(!i||this.options.ecmaVersion<8||this.strict||"var"!==t.kind||"Identifier"!==t.declarations[0].id.type)&&this.raise(t.start,(i?"for-in":"for-of")+" loop variable declaration may not have an initializer"),e.left=t,e.right=i?this.parseExpression():this.parseMaybeAssign(),this.expect(Aa.parenR),e.body=this.parseStatement("for"),this.exitScope(),this.labels.pop(),this.finishNode(e,i?"ForInStatement":"ForOfStatement")},Ya.parseVar=function(e,t,i){for(e.declarations=[],e.kind=i;;){var s=this.startNode();if(this.parseVarId(s,i),this.eat(Aa.eq)?s.init=this.parseMaybeAssign(t):"const"!==i||this.type===Aa._in||this.options.ecmaVersion>=6&&this.isContextual("of")?"Identifier"===s.id.type||t&&(this.type===Aa._in||this.isContextual("of"))?s.init=null:this.raise(this.lastTokEnd,"Complex binding patterns require an initialization value"):this.unexpected(),e.declarations.push(this.finishNode(s,"VariableDeclarator")),!this.eat(Aa.comma))break}return e},Ya.parseVarId=function(e,t){e.id=this.parseBindingAtom(),this.checkLValPattern(e.id,"var"===t?1:2,!1);};var eo=1,to=2;function io(e,t){var i=t.key.name,s=e[i],n="true";return "MethodDefinition"!==t.type||"get"!==t.kind&&"set"!==t.kind||(n=(t.static?"s":"i")+t.kind),"iget"===s&&"iset"===n||"iset"===s&&"iget"===n||"sget"===s&&"sset"===n||"sset"===s&&"sget"===n?(e[i]="true",!1):!!s||(e[i]=n,!1)}function so(e,t){var i=e.computed,s=e.key;return !i&&("Identifier"===s.type&&s.name===t||"Literal"===s.type&&s.value===t)}Ya.parseFunction=function(e,t,i,s,n){this.initFunction(e),(this.options.ecmaVersion>=9||this.options.ecmaVersion>=6&&!s)&&(this.type===Aa.star&&t&to&&this.unexpected(),e.generator=this.eat(Aa.star)),this.options.ecmaVersion>=8&&(e.async=!!s),t&eo&&(e.id=4&t&&this.type!==Aa.name?null:this.parseIdent(),!e.id||t&to||this.checkLValSimple(e.id,this.strict||e.generator||e.async?this.treatFunctionsAsVar?1:2:3));var r=this.yieldPos,a=this.awaitPos,o=this.awaitIdentPos;return this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,this.enterScope(Ga(e.async,e.generator)),t&eo||(e.id=this.type===Aa.name?this.parseIdent():null),this.parseFunctionParams(e),this.parseFunctionBody(e,i,!1,n),this.yieldPos=r,this.awaitPos=a,this.awaitIdentPos=o,this.finishNode(e,t&eo?"FunctionDeclaration":"FunctionExpression")},Ya.parseFunctionParams=function(e){this.expect(Aa.parenL),e.params=this.parseBindingList(Aa.parenR,!1,this.options.ecmaVersion>=8),this.checkYieldAwaitInDefaultParams();},Ya.parseClass=function(e,t){this.next();var i=this.strict;this.strict=!0,this.parseClassId(e,t),this.parseClassSuper(e);var s=this.enterClassBody(),n=this.startNode(),r=!1;for(n.body=[],this.expect(Aa.braceL);this.type!==Aa.braceR;){var a=this.parseClassElement(null!==e.superClass);a&&(n.body.push(a),"MethodDefinition"===a.type&&"constructor"===a.kind?(r&&this.raise(a.start,"Duplicate constructor in the same class"),r=!0):a.key&&"PrivateIdentifier"===a.key.type&&io(s,a)&&this.raiseRecoverable(a.key.start,"Identifier '#"+a.key.name+"' has already been declared"));}return this.strict=i,this.next(),e.body=this.finishNode(n,"ClassBody"),this.exitClassBody(),this.finishNode(e,t?"ClassDeclaration":"ClassExpression")},Ya.parseClassElement=function(e){if(this.eat(Aa.semi))return null;var t=this.options.ecmaVersion,i=this.startNode(),s="",n=!1,r=!1,a="method",o=!1;if(this.eatContextual("static")){if(t>=13&&this.eat(Aa.braceL))return this.parseClassStaticBlock(i),i;this.isClassElementNameStart()||this.type===Aa.star?o=!0:s="static";}if(i.static=o,!s&&t>=8&&this.eatContextual("async")&&(!this.isClassElementNameStart()&&this.type!==Aa.star||this.canInsertSemicolon()?s="async":r=!0),!s&&(t>=9||!r)&&this.eat(Aa.star)&&(n=!0),!s&&!r&&!n){var l=this.value;(this.eatContextual("get")||this.eatContextual("set"))&&(this.isClassElementNameStart()?a=l:s=l);}if(s?(i.computed=!1,i.key=this.startNodeAt(this.lastTokStart,this.lastTokStartLoc),i.key.name=s,this.finishNode(i.key,"Identifier")):this.parseClassElementName(i),t<13||this.type===Aa.parenL||"method"!==a||n||r){var h=!i.static&&so(i,"constructor"),c=h&&e;h&&"method"!==a&&this.raise(i.key.start,"Constructor can't have get/set modifier"),i.kind=h?"constructor":a,this.parseClassMethod(i,n,r,c);}else this.parseClassField(i);return i},Ya.isClassElementNameStart=function(){return this.type===Aa.name||this.type===Aa.privateId||this.type===Aa.num||this.type===Aa.string||this.type===Aa.bracketL||this.type.keyword},Ya.parseClassElementName=function(e){this.type===Aa.privateId?("constructor"===this.value&&this.raise(this.start,"Classes can't have an element named '#constructor'"),e.computed=!1,e.key=this.parsePrivateIdent()):this.parsePropertyName(e);},Ya.parseClassMethod=function(e,t,i,s){var n=e.key;"constructor"===e.kind?(t&&this.raise(n.start,"Constructor can't be a generator"),i&&this.raise(n.start,"Constructor can't be an async method")):e.static&&so(e,"prototype")&&this.raise(n.start,"Classes may not have a static property named prototype");var r=e.value=this.parseMethod(t,i,s);return "get"===e.kind&&0!==r.params.length&&this.raiseRecoverable(r.start,"getter should have no params"),"set"===e.kind&&1!==r.params.length&&this.raiseRecoverable(r.start,"setter should have exactly one param"),"set"===e.kind&&"RestElement"===r.params[0].type&&this.raiseRecoverable(r.params[0].start,"Setter cannot use rest params"),this.finishNode(e,"MethodDefinition")},Ya.parseClassField=function(e){if(so(e,"constructor")?this.raise(e.key.start,"Classes can't have a field named 'constructor'"):e.static&&so(e,"prototype")&&this.raise(e.key.start,"Classes can't have a static field named 'prototype'"),this.eat(Aa.eq)){var t=this.currentThisScope(),i=t.inClassFieldInit;t.inClassFieldInit=!0,e.value=this.parseMaybeAssign(),t.inClassFieldInit=i;}else e.value=null;return this.semicolon(),this.finishNode(e,"PropertyDefinition")},Ya.parseClassStaticBlock=function(e){e.body=[];var t=this.labels;for(this.labels=[],this.enterScope(320);this.type!==Aa.braceR;){var i=this.parseStatement(null);e.body.push(i);}return this.next(),this.exitScope(),this.labels=t,this.finishNode(e,"StaticBlock")},Ya.parseClassId=function(e,t){this.type===Aa.name?(e.id=this.parseIdent(),t&&this.checkLValSimple(e.id,2,!1)):(!0===t&&this.unexpected(),e.id=null);},Ya.parseClassSuper=function(e){e.superClass=this.eat(Aa._extends)?this.parseExprSubscripts(!1):null;},Ya.enterClassBody=function(){var e={declared:Object.create(null),used:[]};return this.privateNameStack.push(e),e.declared},Ya.exitClassBody=function(){for(var e=this.privateNameStack.pop(),t=e.declared,i=e.used,s=this.privateNameStack.length,n=0===s?null:this.privateNameStack[s-1],r=0;r<i.length;++r){var a=i[r];Oa(t,a.name)||(n?n.used.push(a):this.raiseRecoverable(a.start,"Private field '#"+a.name+"' must be declared in an enclosing class"));}},Ya.parseExport=function(e,t){if(this.next(),this.eat(Aa.star))return this.options.ecmaVersion>=11&&(this.eatContextual("as")?(e.exported=this.parseModuleExportName(),this.checkExport(t,e.exported,this.lastTokStart)):e.exported=null),this.expectContextual("from"),this.type!==Aa.string&&this.unexpected(),e.source=this.parseExprAtom(),this.semicolon(),this.finishNode(e,"ExportAllDeclaration");if(this.eat(Aa._default)){var i;if(this.checkExport(t,"default",this.lastTokStart),this.type===Aa._function||(i=this.isAsyncFunction())){var s=this.startNode();this.next(),i&&this.next(),e.declaration=this.parseFunction(s,4|eo,!1,i);}else if(this.type===Aa._class){var n=this.startNode();e.declaration=this.parseClass(n,"nullableID");}else e.declaration=this.parseMaybeAssign(),this.semicolon();return this.finishNode(e,"ExportDefaultDeclaration")}if(this.shouldParseExportStatement())e.declaration=this.parseStatement(null),"VariableDeclaration"===e.declaration.type?this.checkVariableExport(t,e.declaration.declarations):this.checkExport(t,e.declaration.id,e.declaration.id.start),e.specifiers=[],e.source=null;else {if(e.declaration=null,e.specifiers=this.parseExportSpecifiers(t),this.eatContextual("from"))this.type!==Aa.string&&this.unexpected(),e.source=this.parseExprAtom();else {for(var r=0,a=e.specifiers;r<a.length;r+=1){var o=a[r];this.checkUnreserved(o.local),this.checkLocalExport(o.local),"Literal"===o.local.type&&this.raise(o.local.start,"A string literal cannot be used as an exported binding without `from`.");}e.source=null;}this.semicolon();}return this.finishNode(e,"ExportNamedDeclaration")},Ya.checkExport=function(e,t,i){e&&("string"!=typeof t&&(t="Identifier"===t.type?t.name:t.value),Oa(e,t)&&this.raiseRecoverable(i,"Duplicate export '"+t+"'"),e[t]=!0);},Ya.checkPatternExport=function(e,t){var i=t.type;if("Identifier"===i)this.checkExport(e,t,t.start);else if("ObjectPattern"===i)for(var s=0,n=t.properties;s<n.length;s+=1){var r=n[s];this.checkPatternExport(e,r);}else if("ArrayPattern"===i)for(var a=0,o=t.elements;a<o.length;a+=1){var l=o[a];l&&this.checkPatternExport(e,l);}else "Property"===i?this.checkPatternExport(e,t.value):"AssignmentPattern"===i?this.checkPatternExport(e,t.left):"RestElement"===i?this.checkPatternExport(e,t.argument):"ParenthesizedExpression"===i&&this.checkPatternExport(e,t.expression);},Ya.checkVariableExport=function(e,t){if(e)for(var i=0,s=t;i<s.length;i+=1){var n=s[i];this.checkPatternExport(e,n.id);}},Ya.shouldParseExportStatement=function(){return "var"===this.type.keyword||"const"===this.type.keyword||"class"===this.type.keyword||"function"===this.type.keyword||this.isLet()||this.isAsyncFunction()},Ya.parseExportSpecifiers=function(e){var t=[],i=!0;for(this.expect(Aa.braceL);!this.eat(Aa.braceR);){if(i)i=!1;else if(this.expect(Aa.comma),this.afterTrailingComma(Aa.braceR))break;var s=this.startNode();s.local=this.parseModuleExportName(),s.exported=this.eatContextual("as")?this.parseModuleExportName():s.local,this.checkExport(e,s.exported,s.exported.start),t.push(this.finishNode(s,"ExportSpecifier"));}return t},Ya.parseImport=function(e){return this.next(),this.type===Aa.string?(e.specifiers=Ja,e.source=this.parseExprAtom()):(e.specifiers=this.parseImportSpecifiers(),this.expectContextual("from"),e.source=this.type===Aa.string?this.parseExprAtom():this.unexpected()),this.semicolon(),this.finishNode(e,"ImportDeclaration")},Ya.parseImportSpecifiers=function(){var e=[],t=!0;if(this.type===Aa.name){var i=this.startNode();if(i.local=this.parseIdent(),this.checkLValSimple(i.local,2),e.push(this.finishNode(i,"ImportDefaultSpecifier")),!this.eat(Aa.comma))return e}if(this.type===Aa.star){var s=this.startNode();return this.next(),this.expectContextual("as"),s.local=this.parseIdent(),this.checkLValSimple(s.local,2),e.push(this.finishNode(s,"ImportNamespaceSpecifier")),e}for(this.expect(Aa.braceL);!this.eat(Aa.braceR);){if(t)t=!1;else if(this.expect(Aa.comma),this.afterTrailingComma(Aa.braceR))break;var n=this.startNode();n.imported=this.parseModuleExportName(),this.eatContextual("as")?n.local=this.parseIdent():(this.checkUnreserved(n.imported),n.local=n.imported),this.checkLValSimple(n.local,2),e.push(this.finishNode(n,"ImportSpecifier"));}return e},Ya.parseModuleExportName=function(){if(this.options.ecmaVersion>=13&&this.type===Aa.string){var e=this.parseLiteral(this.value);return La.test(e.value)&&this.raise(e.start,"An export name cannot include a lone surrogate."),e}return this.parseIdent(!0)},Ya.adaptDirectivePrologue=function(e){for(var t=0;t<e.length&&this.isDirectiveCandidate(e[t]);++t)e[t].directive=e[t].expression.raw.slice(1,-1);},Ya.isDirectiveCandidate=function(e){return "ExpressionStatement"===e.type&&"Literal"===e.expression.type&&"string"==typeof e.expression.value&&('"'===this.input[e.start]||"'"===this.input[e.start])};var no=Ha.prototype;no.toAssignable=function(e,t,i){if(this.options.ecmaVersion>=6&&e)switch(e.type){case"Identifier":this.inAsync&&"await"===e.name&&this.raise(e.start,"Cannot use 'await' as identifier inside an async function");break;case"ObjectPattern":case"ArrayPattern":case"AssignmentPattern":case"RestElement":break;case"ObjectExpression":e.type="ObjectPattern",i&&this.checkPatternErrors(i,!0);for(var s=0,n=e.properties;s<n.length;s+=1){var r=n[s];this.toAssignable(r,t),"RestElement"!==r.type||"ArrayPattern"!==r.argument.type&&"ObjectPattern"!==r.argument.type||this.raise(r.argument.start,"Unexpected token");}break;case"Property":"init"!==e.kind&&this.raise(e.key.start,"Object pattern can't contain getter or setter"),this.toAssignable(e.value,t);break;case"ArrayExpression":e.type="ArrayPattern",i&&this.checkPatternErrors(i,!0),this.toAssignableList(e.elements,t);break;case"SpreadElement":e.type="RestElement",this.toAssignable(e.argument,t),"AssignmentPattern"===e.argument.type&&this.raise(e.argument.start,"Rest elements cannot have a default value");break;case"AssignmentExpression":"="!==e.operator&&this.raise(e.left.end,"Only '=' operator can be used for specifying default value."),e.type="AssignmentPattern",delete e.operator,this.toAssignable(e.left,t);break;case"ParenthesizedExpression":this.toAssignable(e.expression,t,i);break;case"ChainExpression":this.raiseRecoverable(e.start,"Optional chaining cannot appear in left-hand side");break;case"MemberExpression":if(!t)break;default:this.raise(e.start,"Assigning to rvalue");}else i&&this.checkPatternErrors(i,!0);return e},no.toAssignableList=function(e,t){for(var i=e.length,s=0;s<i;s++){var n=e[s];n&&this.toAssignable(n,t);}if(i){var r=e[i-1];6===this.options.ecmaVersion&&t&&r&&"RestElement"===r.type&&"Identifier"!==r.argument.type&&this.unexpected(r.argument.start);}return e},no.parseSpread=function(e){var t=this.startNode();return this.next(),t.argument=this.parseMaybeAssign(!1,e),this.finishNode(t,"SpreadElement")},no.parseRestBinding=function(){var e=this.startNode();return this.next(),6===this.options.ecmaVersion&&this.type!==Aa.name&&this.unexpected(),e.argument=this.parseBindingAtom(),this.finishNode(e,"RestElement")},no.parseBindingAtom=function(){if(this.options.ecmaVersion>=6)switch(this.type){case Aa.bracketL:var e=this.startNode();return this.next(),e.elements=this.parseBindingList(Aa.bracketR,!0,!0),this.finishNode(e,"ArrayPattern");case Aa.braceL:return this.parseObj(!0)}return this.parseIdent()},no.parseBindingList=function(e,t,i){for(var s=[],n=!0;!this.eat(e);)if(n?n=!1:this.expect(Aa.comma),t&&this.type===Aa.comma)s.push(null);else {if(i&&this.afterTrailingComma(e))break;if(this.type===Aa.ellipsis){var r=this.parseRestBinding();this.parseBindingListItem(r),s.push(r),this.type===Aa.comma&&this.raise(this.start,"Comma is not permitted after the rest element"),this.expect(e);break}var a=this.parseMaybeDefault(this.start,this.startLoc);this.parseBindingListItem(a),s.push(a);}return s},no.parseBindingListItem=function(e){return e},no.parseMaybeDefault=function(e,t,i){if(i=i||this.parseBindingAtom(),this.options.ecmaVersion<6||!this.eat(Aa.eq))return i;var s=this.startNodeAt(e,t);return s.left=i,s.right=this.parseMaybeAssign(),this.finishNode(s,"AssignmentPattern")},no.checkLValSimple=function(e,t,i){void 0===t&&(t=0);var s=0!==t;switch(e.type){case"Identifier":this.strict&&this.reservedWordsStrictBind.test(e.name)&&this.raiseRecoverable(e.start,(s?"Binding ":"Assigning to ")+e.name+" in strict mode"),s&&(2===t&&"let"===e.name&&this.raiseRecoverable(e.start,"let is disallowed as a lexically bound name"),i&&(Oa(i,e.name)&&this.raiseRecoverable(e.start,"Argument name clash"),i[e.name]=!0),5!==t&&this.declareName(e.name,t,e.start));break;case"ChainExpression":this.raiseRecoverable(e.start,"Optional chaining cannot appear in left-hand side");break;case"MemberExpression":s&&this.raiseRecoverable(e.start,"Binding member expression");break;case"ParenthesizedExpression":return s&&this.raiseRecoverable(e.start,"Binding parenthesized expression"),this.checkLValSimple(e.expression,t,i);default:this.raise(e.start,(s?"Binding":"Assigning to")+" rvalue");}},no.checkLValPattern=function(e,t,i){switch(void 0===t&&(t=0),e.type){case"ObjectPattern":for(var s=0,n=e.properties;s<n.length;s+=1){var r=n[s];this.checkLValInnerPattern(r,t,i);}break;case"ArrayPattern":for(var a=0,o=e.elements;a<o.length;a+=1){var l=o[a];l&&this.checkLValInnerPattern(l,t,i);}break;default:this.checkLValSimple(e,t,i);}},no.checkLValInnerPattern=function(e,t,i){switch(void 0===t&&(t=0),e.type){case"Property":this.checkLValInnerPattern(e.value,t,i);break;case"AssignmentPattern":this.checkLValPattern(e.left,t,i);break;case"RestElement":this.checkLValPattern(e.argument,t,i);break;default:this.checkLValPattern(e,t,i);}};var ro=function(e,t,i,s,n){this.token=e,this.isExpr=!!t,this.preserveSpace=!!i,this.override=s,this.generator=!!n;},ao={b_stat:new ro("{",!1),b_expr:new ro("{",!0),b_tmpl:new ro("${",!1),p_stat:new ro("(",!1),p_expr:new ro("(",!0),q_tmpl:new ro("`",!0,!0,(function(e){return e.tryReadTemplateToken()})),f_stat:new ro("function",!1),f_expr:new ro("function",!0),f_expr_gen:new ro("function",!0,!1,null,!0),f_gen:new ro("function",!1,!1,null,!0)},oo=Ha.prototype;oo.initialContext=function(){return [ao.b_stat]},oo.curContext=function(){return this.context[this.context.length-1]},oo.braceIsBlock=function(e){var t=this.curContext();return t===ao.f_expr||t===ao.f_stat||(e!==Aa.colon||t!==ao.b_stat&&t!==ao.b_expr?e===Aa._return||e===Aa.name&&this.exprAllowed?Ia.test(this.input.slice(this.lastTokEnd,this.start)):e===Aa._else||e===Aa.semi||e===Aa.eof||e===Aa.parenR||e===Aa.arrow||(e===Aa.braceL?t===ao.b_stat:e!==Aa._var&&e!==Aa._const&&e!==Aa.name&&!this.exprAllowed):!t.isExpr)},oo.inGeneratorContext=function(){for(var e=this.context.length-1;e>=1;e--){var t=this.context[e];if("function"===t.token)return t.generator}return !1},oo.updateContext=function(e){var t,i=this.type;i.keyword&&e===Aa.dot?this.exprAllowed=!1:(t=i.updateContext)?t.call(this,e):this.exprAllowed=i.beforeExpr;},oo.overrideContext=function(e){this.curContext()!==e&&(this.context[this.context.length-1]=e);},Aa.parenR.updateContext=Aa.braceR.updateContext=function(){if(1!==this.context.length){var e=this.context.pop();e===ao.b_stat&&"function"===this.curContext().token&&(e=this.context.pop()),this.exprAllowed=!e.isExpr;}else this.exprAllowed=!0;},Aa.braceL.updateContext=function(e){this.context.push(this.braceIsBlock(e)?ao.b_stat:ao.b_expr),this.exprAllowed=!0;},Aa.dollarBraceL.updateContext=function(){this.context.push(ao.b_tmpl),this.exprAllowed=!0;},Aa.parenL.updateContext=function(e){var t=e===Aa._if||e===Aa._for||e===Aa._with||e===Aa._while;this.context.push(t?ao.p_stat:ao.p_expr),this.exprAllowed=!0;},Aa.incDec.updateContext=function(){},Aa._function.updateContext=Aa._class.updateContext=function(e){!e.beforeExpr||e===Aa._else||e===Aa.semi&&this.curContext()!==ao.p_stat||e===Aa._return&&Ia.test(this.input.slice(this.lastTokEnd,this.start))||(e===Aa.colon||e===Aa.braceL)&&this.curContext()===ao.b_stat?this.context.push(ao.f_stat):this.context.push(ao.f_expr),this.exprAllowed=!1;},Aa.backQuote.updateContext=function(){this.curContext()===ao.q_tmpl?this.context.pop():this.context.push(ao.q_tmpl),this.exprAllowed=!1;},Aa.star.updateContext=function(e){if(e===Aa._function){var t=this.context.length-1;this.context[t]===ao.f_expr?this.context[t]=ao.f_expr_gen:this.context[t]=ao.f_gen;}this.exprAllowed=!0;},Aa.name.updateContext=function(e){var t=!1;this.options.ecmaVersion>=6&&e!==Aa.dot&&("of"===this.value&&!this.exprAllowed||"yield"===this.value&&this.inGeneratorContext())&&(t=!0),this.exprAllowed=t;};var lo=Ha.prototype;function ho(e){return "MemberExpression"===e.type&&"PrivateIdentifier"===e.property.type||"ChainExpression"===e.type&&ho(e.expression)}lo.checkPropClash=function(e,t,i){if(!(this.options.ecmaVersion>=9&&"SpreadElement"===e.type||this.options.ecmaVersion>=6&&(e.computed||e.method||e.shorthand))){var s,n=e.key;switch(n.type){case"Identifier":s=n.name;break;case"Literal":s=String(n.value);break;default:return}var r=e.kind;if(this.options.ecmaVersion>=6)"__proto__"===s&&"init"===r&&(t.proto&&(i?i.doubleProto<0&&(i.doubleProto=n.start):this.raiseRecoverable(n.start,"Redefinition of __proto__ property")),t.proto=!0);else {var a=t[s="$"+s];if(a)("init"===r?this.strict&&a.init||a.get||a.set:a.init||a[r])&&this.raiseRecoverable(n.start,"Redefinition of property");else a=t[s]={init:!1,get:!1,set:!1};a[r]=!0;}}},lo.parseExpression=function(e,t){var i=this.start,s=this.startLoc,n=this.parseMaybeAssign(e,t);if(this.type===Aa.comma){var r=this.startNodeAt(i,s);for(r.expressions=[n];this.eat(Aa.comma);)r.expressions.push(this.parseMaybeAssign(e,t));return this.finishNode(r,"SequenceExpression")}return n},lo.parseMaybeAssign=function(e,t,i){if(this.isContextual("yield")){if(this.inGenerator)return this.parseYield(e);this.exprAllowed=!1;}var s=!1,n=-1,r=-1,a=-1;t?(n=t.parenthesizedAssign,r=t.trailingComma,a=t.doubleProto,t.parenthesizedAssign=t.trailingComma=-1):(t=new Xa,s=!0);var o=this.start,l=this.startLoc;this.type!==Aa.parenL&&this.type!==Aa.name||(this.potentialArrowAt=this.start,this.potentialArrowInForAwait="await"===e);var h=this.parseMaybeConditional(e,t);if(i&&(h=i.call(this,h,o,l)),this.type.isAssign){var c=this.startNodeAt(o,l);return c.operator=this.value,this.type===Aa.eq&&(h=this.toAssignable(h,!1,t)),s||(t.parenthesizedAssign=t.trailingComma=t.doubleProto=-1),t.shorthandAssign>=h.start&&(t.shorthandAssign=-1),this.type===Aa.eq?this.checkLValPattern(h):this.checkLValSimple(h),c.left=h,this.next(),c.right=this.parseMaybeAssign(e),a>-1&&(t.doubleProto=a),this.finishNode(c,"AssignmentExpression")}return s&&this.checkExpressionErrors(t,!0),n>-1&&(t.parenthesizedAssign=n),r>-1&&(t.trailingComma=r),h},lo.parseMaybeConditional=function(e,t){var i=this.start,s=this.startLoc,n=this.parseExprOps(e,t);if(this.checkExpressionErrors(t))return n;if(this.eat(Aa.question)){var r=this.startNodeAt(i,s);return r.test=n,r.consequent=this.parseMaybeAssign(),this.expect(Aa.colon),r.alternate=this.parseMaybeAssign(e),this.finishNode(r,"ConditionalExpression")}return n},lo.parseExprOps=function(e,t){var i=this.start,s=this.startLoc,n=this.parseMaybeUnary(t,!1,!1,e);return this.checkExpressionErrors(t)||n.start===i&&"ArrowFunctionExpression"===n.type?n:this.parseExprOp(n,i,s,-1,e)},lo.parseExprOp=function(e,t,i,s,n){var r=this.type.binop;if(null!=r&&(!n||this.type!==Aa._in)&&r>s){var a=this.type===Aa.logicalOR||this.type===Aa.logicalAND,o=this.type===Aa.coalesce;o&&(r=Aa.logicalAND.binop);var l=this.value;this.next();var h=this.start,c=this.startLoc,u=this.parseExprOp(this.parseMaybeUnary(null,!1,!1,n),h,c,r,n),d=this.buildBinary(t,i,e,u,l,a||o);return (a&&this.type===Aa.coalesce||o&&(this.type===Aa.logicalOR||this.type===Aa.logicalAND))&&this.raiseRecoverable(this.start,"Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses"),this.parseExprOp(d,t,i,s,n)}return e},lo.buildBinary=function(e,t,i,s,n,r){"PrivateIdentifier"===s.type&&this.raise(s.start,"Private identifier can only be left side of binary expression");var a=this.startNodeAt(e,t);return a.left=i,a.operator=n,a.right=s,this.finishNode(a,r?"LogicalExpression":"BinaryExpression")},lo.parseMaybeUnary=function(e,t,i,s){var n,r=this.start,a=this.startLoc;if(this.isContextual("await")&&this.canAwait)n=this.parseAwait(s),t=!0;else if(this.type.prefix){var o=this.startNode(),l=this.type===Aa.incDec;o.operator=this.value,o.prefix=!0,this.next(),o.argument=this.parseMaybeUnary(null,!0,l,s),this.checkExpressionErrors(e,!0),l?this.checkLValSimple(o.argument):this.strict&&"delete"===o.operator&&"Identifier"===o.argument.type?this.raiseRecoverable(o.start,"Deleting local variable in strict mode"):"delete"===o.operator&&ho(o.argument)?this.raiseRecoverable(o.start,"Private fields can not be deleted"):t=!0,n=this.finishNode(o,l?"UpdateExpression":"UnaryExpression");}else if(t||this.type!==Aa.privateId){if(n=this.parseExprSubscripts(e,s),this.checkExpressionErrors(e))return n;for(;this.type.postfix&&!this.canInsertSemicolon();){var h=this.startNodeAt(r,a);h.operator=this.value,h.prefix=!1,h.argument=n,this.checkLValSimple(n),this.next(),n=this.finishNode(h,"UpdateExpression");}}else (s||0===this.privateNameStack.length)&&this.unexpected(),n=this.parsePrivateIdent(),this.type!==Aa._in&&this.unexpected();return i||!this.eat(Aa.starstar)?n:t?void this.unexpected(this.lastTokStart):this.buildBinary(r,a,n,this.parseMaybeUnary(null,!1,!1,s),"**",!1)},lo.parseExprSubscripts=function(e,t){var i=this.start,s=this.startLoc,n=this.parseExprAtom(e,t);if("ArrowFunctionExpression"===n.type&&")"!==this.input.slice(this.lastTokStart,this.lastTokEnd))return n;var r=this.parseSubscripts(n,i,s,!1,t);return e&&"MemberExpression"===r.type&&(e.parenthesizedAssign>=r.start&&(e.parenthesizedAssign=-1),e.parenthesizedBind>=r.start&&(e.parenthesizedBind=-1),e.trailingComma>=r.start&&(e.trailingComma=-1)),r},lo.parseSubscripts=function(e,t,i,s,n){for(var r=this.options.ecmaVersion>=8&&"Identifier"===e.type&&"async"===e.name&&this.lastTokEnd===e.end&&!this.canInsertSemicolon()&&e.end-e.start==5&&this.potentialArrowAt===e.start,a=!1;;){var o=this.parseSubscript(e,t,i,s,r,a,n);if(o.optional&&(a=!0),o===e||"ArrowFunctionExpression"===o.type){if(a){var l=this.startNodeAt(t,i);l.expression=o,o=this.finishNode(l,"ChainExpression");}return o}e=o;}},lo.parseSubscript=function(e,t,i,s,n,r,a){var o=this.options.ecmaVersion>=11,l=o&&this.eat(Aa.questionDot);s&&l&&this.raise(this.lastTokStart,"Optional chaining cannot appear in the callee of new expressions");var h=this.eat(Aa.bracketL);if(h||l&&this.type!==Aa.parenL&&this.type!==Aa.backQuote||this.eat(Aa.dot)){var c=this.startNodeAt(t,i);c.object=e,h?(c.property=this.parseExpression(),this.expect(Aa.bracketR)):this.type===Aa.privateId&&"Super"!==e.type?c.property=this.parsePrivateIdent():c.property=this.parseIdent("never"!==this.options.allowReserved),c.computed=!!h,o&&(c.optional=l),e=this.finishNode(c,"MemberExpression");}else if(!s&&this.eat(Aa.parenL)){var u=new Xa,d=this.yieldPos,p=this.awaitPos,f=this.awaitIdentPos;this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0;var m=this.parseExprList(Aa.parenR,this.options.ecmaVersion>=8,!1,u);if(n&&!l&&!this.canInsertSemicolon()&&this.eat(Aa.arrow))return this.checkPatternErrors(u,!1),this.checkYieldAwaitInDefaultParams(),this.awaitIdentPos>0&&this.raise(this.awaitIdentPos,"Cannot use 'await' as identifier inside an async function"),this.yieldPos=d,this.awaitPos=p,this.awaitIdentPos=f,this.parseArrowExpression(this.startNodeAt(t,i),m,!0,a);this.checkExpressionErrors(u,!0),this.yieldPos=d||this.yieldPos,this.awaitPos=p||this.awaitPos,this.awaitIdentPos=f||this.awaitIdentPos;var g=this.startNodeAt(t,i);g.callee=e,g.arguments=m,o&&(g.optional=l),e=this.finishNode(g,"CallExpression");}else if(this.type===Aa.backQuote){(l||r)&&this.raise(this.start,"Optional chaining cannot appear in the tag of tagged template expressions");var y=this.startNodeAt(t,i);y.tag=e,y.quasi=this.parseTemplate({isTagged:!0}),e=this.finishNode(y,"TaggedTemplateExpression");}return e},lo.parseExprAtom=function(e,t){this.type===Aa.slash&&this.readRegexp();var i,s=this.potentialArrowAt===this.start;switch(this.type){case Aa._super:return this.allowSuper||this.raise(this.start,"'super' keyword outside a method"),i=this.startNode(),this.next(),this.type!==Aa.parenL||this.allowDirectSuper||this.raise(i.start,"super() call outside constructor of a subclass"),this.type!==Aa.dot&&this.type!==Aa.bracketL&&this.type!==Aa.parenL&&this.unexpected(),this.finishNode(i,"Super");case Aa._this:return i=this.startNode(),this.next(),this.finishNode(i,"ThisExpression");case Aa.name:var n=this.start,r=this.startLoc,a=this.containsEsc,o=this.parseIdent(!1);if(this.options.ecmaVersion>=8&&!a&&"async"===o.name&&!this.canInsertSemicolon()&&this.eat(Aa._function))return this.overrideContext(ao.f_expr),this.parseFunction(this.startNodeAt(n,r),0,!1,!0,t);if(s&&!this.canInsertSemicolon()){if(this.eat(Aa.arrow))return this.parseArrowExpression(this.startNodeAt(n,r),[o],!1,t);if(this.options.ecmaVersion>=8&&"async"===o.name&&this.type===Aa.name&&!a&&(!this.potentialArrowInForAwait||"of"!==this.value||this.containsEsc))return o=this.parseIdent(!1),!this.canInsertSemicolon()&&this.eat(Aa.arrow)||this.unexpected(),this.parseArrowExpression(this.startNodeAt(n,r),[o],!0,t)}return o;case Aa.regexp:var l=this.value;return (i=this.parseLiteral(l.value)).regex={pattern:l.pattern,flags:l.flags},i;case Aa.num:case Aa.string:return this.parseLiteral(this.value);case Aa._null:case Aa._true:case Aa._false:return (i=this.startNode()).value=this.type===Aa._null?null:this.type===Aa._true,i.raw=this.type.keyword,this.next(),this.finishNode(i,"Literal");case Aa.parenL:var h=this.start,c=this.parseParenAndDistinguishExpression(s,t);return e&&(e.parenthesizedAssign<0&&!this.isSimpleAssignTarget(c)&&(e.parenthesizedAssign=h),e.parenthesizedBind<0&&(e.parenthesizedBind=h)),c;case Aa.bracketL:return i=this.startNode(),this.next(),i.elements=this.parseExprList(Aa.bracketR,!0,!0,e),this.finishNode(i,"ArrayExpression");case Aa.braceL:return this.overrideContext(ao.b_expr),this.parseObj(!1,e);case Aa._function:return i=this.startNode(),this.next(),this.parseFunction(i,0);case Aa._class:return this.parseClass(this.startNode(),!1);case Aa._new:return this.parseNew();case Aa.backQuote:return this.parseTemplate();case Aa._import:return this.options.ecmaVersion>=11?this.parseExprImport():this.unexpected();default:this.unexpected();}},lo.parseExprImport=function(){var e=this.startNode();this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword import");var t=this.parseIdent(!0);switch(this.type){case Aa.parenL:return this.parseDynamicImport(e);case Aa.dot:return e.meta=t,this.parseImportMeta(e);default:this.unexpected();}},lo.parseDynamicImport=function(e){if(this.next(),e.source=this.parseMaybeAssign(),!this.eat(Aa.parenR)){var t=this.start;this.eat(Aa.comma)&&this.eat(Aa.parenR)?this.raiseRecoverable(t,"Trailing comma is not allowed in import()"):this.unexpected(t);}return this.finishNode(e,"ImportExpression")},lo.parseImportMeta=function(e){this.next();var t=this.containsEsc;return e.property=this.parseIdent(!0),"meta"!==e.property.name&&this.raiseRecoverable(e.property.start,"The only valid meta property for import is 'import.meta'"),t&&this.raiseRecoverable(e.start,"'import.meta' must not contain escaped characters"),"module"===this.options.sourceType||this.options.allowImportExportEverywhere||this.raiseRecoverable(e.start,"Cannot use 'import.meta' outside a module"),this.finishNode(e,"MetaProperty")},lo.parseLiteral=function(e){var t=this.startNode();return t.value=e,t.raw=this.input.slice(this.start,this.end),110===t.raw.charCodeAt(t.raw.length-1)&&(t.bigint=t.raw.slice(0,-1).replace(/_/g,"")),this.next(),this.finishNode(t,"Literal")},lo.parseParenExpression=function(){this.expect(Aa.parenL);var e=this.parseExpression();return this.expect(Aa.parenR),e},lo.parseParenAndDistinguishExpression=function(e,t){var i,s=this.start,n=this.startLoc,r=this.options.ecmaVersion>=8;if(this.options.ecmaVersion>=6){this.next();var a,o=this.start,l=this.startLoc,h=[],c=!0,u=!1,d=new Xa,p=this.yieldPos,f=this.awaitPos;for(this.yieldPos=0,this.awaitPos=0;this.type!==Aa.parenR;){if(c?c=!1:this.expect(Aa.comma),r&&this.afterTrailingComma(Aa.parenR,!0)){u=!0;break}if(this.type===Aa.ellipsis){a=this.start,h.push(this.parseParenItem(this.parseRestBinding())),this.type===Aa.comma&&this.raise(this.start,"Comma is not permitted after the rest element");break}h.push(this.parseMaybeAssign(!1,d,this.parseParenItem));}var m=this.lastTokEnd,g=this.lastTokEndLoc;if(this.expect(Aa.parenR),e&&!this.canInsertSemicolon()&&this.eat(Aa.arrow))return this.checkPatternErrors(d,!1),this.checkYieldAwaitInDefaultParams(),this.yieldPos=p,this.awaitPos=f,this.parseParenArrowList(s,n,h,t);h.length&&!u||this.unexpected(this.lastTokStart),a&&this.unexpected(a),this.checkExpressionErrors(d,!0),this.yieldPos=p||this.yieldPos,this.awaitPos=f||this.awaitPos,h.length>1?((i=this.startNodeAt(o,l)).expressions=h,this.finishNodeAt(i,"SequenceExpression",m,g)):i=h[0];}else i=this.parseParenExpression();if(this.options.preserveParens){var y=this.startNodeAt(s,n);return y.expression=i,this.finishNode(y,"ParenthesizedExpression")}return i},lo.parseParenItem=function(e){return e},lo.parseParenArrowList=function(e,t,i,s){return this.parseArrowExpression(this.startNodeAt(e,t),i,!1,s)};var co=[];lo.parseNew=function(){this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword new");var e=this.startNode(),t=this.parseIdent(!0);if(this.options.ecmaVersion>=6&&this.eat(Aa.dot)){e.meta=t;var i=this.containsEsc;return e.property=this.parseIdent(!0),"target"!==e.property.name&&this.raiseRecoverable(e.property.start,"The only valid meta property for new is 'new.target'"),i&&this.raiseRecoverable(e.start,"'new.target' must not contain escaped characters"),this.allowNewDotTarget||this.raiseRecoverable(e.start,"'new.target' can only be used in functions and class static block"),this.finishNode(e,"MetaProperty")}var s=this.start,n=this.startLoc,r=this.type===Aa._import;return e.callee=this.parseSubscripts(this.parseExprAtom(),s,n,!0,!1),r&&"ImportExpression"===e.callee.type&&this.raise(s,"Cannot use new with import()"),this.eat(Aa.parenL)?e.arguments=this.parseExprList(Aa.parenR,this.options.ecmaVersion>=8,!1):e.arguments=co,this.finishNode(e,"NewExpression")},lo.parseTemplateElement=function(e){var t=e.isTagged,i=this.startNode();return this.type===Aa.invalidTemplate?(t||this.raiseRecoverable(this.start,"Bad escape sequence in untagged template literal"),i.value={raw:this.value,cooked:null}):i.value={raw:this.input.slice(this.start,this.end).replace(/\r\n?/g,"\n"),cooked:this.value},this.next(),i.tail=this.type===Aa.backQuote,this.finishNode(i,"TemplateElement")},lo.parseTemplate=function(e){void 0===e&&(e={});var t=e.isTagged;void 0===t&&(t=!1);var i=this.startNode();this.next(),i.expressions=[];var s=this.parseTemplateElement({isTagged:t});for(i.quasis=[s];!s.tail;)this.type===Aa.eof&&this.raise(this.pos,"Unterminated template literal"),this.expect(Aa.dollarBraceL),i.expressions.push(this.parseExpression()),this.expect(Aa.braceR),i.quasis.push(s=this.parseTemplateElement({isTagged:t}));return this.next(),this.finishNode(i,"TemplateLiteral")},lo.isAsyncProp=function(e){return !e.computed&&"Identifier"===e.key.type&&"async"===e.key.name&&(this.type===Aa.name||this.type===Aa.num||this.type===Aa.string||this.type===Aa.bracketL||this.type.keyword||this.options.ecmaVersion>=9&&this.type===Aa.star)&&!Ia.test(this.input.slice(this.lastTokEnd,this.start))},lo.parseObj=function(e,t){var i=this.startNode(),s=!0,n={};for(i.properties=[],this.next();!this.eat(Aa.braceR);){if(s)s=!1;else if(this.expect(Aa.comma),this.options.ecmaVersion>=5&&this.afterTrailingComma(Aa.braceR))break;var r=this.parseProperty(e,t);e||this.checkPropClash(r,n,t),i.properties.push(r);}return this.finishNode(i,e?"ObjectPattern":"ObjectExpression")},lo.parseProperty=function(e,t){var i,s,n,r,a=this.startNode();if(this.options.ecmaVersion>=9&&this.eat(Aa.ellipsis))return e?(a.argument=this.parseIdent(!1),this.type===Aa.comma&&this.raise(this.start,"Comma is not permitted after the rest element"),this.finishNode(a,"RestElement")):(this.type===Aa.parenL&&t&&(t.parenthesizedAssign<0&&(t.parenthesizedAssign=this.start),t.parenthesizedBind<0&&(t.parenthesizedBind=this.start)),a.argument=this.parseMaybeAssign(!1,t),this.type===Aa.comma&&t&&t.trailingComma<0&&(t.trailingComma=this.start),this.finishNode(a,"SpreadElement"));this.options.ecmaVersion>=6&&(a.method=!1,a.shorthand=!1,(e||t)&&(n=this.start,r=this.startLoc),e||(i=this.eat(Aa.star)));var o=this.containsEsc;return this.parsePropertyName(a),!e&&!o&&this.options.ecmaVersion>=8&&!i&&this.isAsyncProp(a)?(s=!0,i=this.options.ecmaVersion>=9&&this.eat(Aa.star),this.parsePropertyName(a,t)):s=!1,this.parsePropertyValue(a,e,i,s,n,r,t,o),this.finishNode(a,"Property")},lo.parsePropertyValue=function(e,t,i,s,n,r,a,o){if((i||s)&&this.type===Aa.colon&&this.unexpected(),this.eat(Aa.colon))e.value=t?this.parseMaybeDefault(this.start,this.startLoc):this.parseMaybeAssign(!1,a),e.kind="init";else if(this.options.ecmaVersion>=6&&this.type===Aa.parenL)t&&this.unexpected(),e.kind="init",e.method=!0,e.value=this.parseMethod(i,s);else if(t||o||!(this.options.ecmaVersion>=5)||e.computed||"Identifier"!==e.key.type||"get"!==e.key.name&&"set"!==e.key.name||this.type===Aa.comma||this.type===Aa.braceR||this.type===Aa.eq)this.options.ecmaVersion>=6&&!e.computed&&"Identifier"===e.key.type?((i||s)&&this.unexpected(),this.checkUnreserved(e.key),"await"!==e.key.name||this.awaitIdentPos||(this.awaitIdentPos=n),e.kind="init",t?e.value=this.parseMaybeDefault(n,r,this.copyNode(e.key)):this.type===Aa.eq&&a?(a.shorthandAssign<0&&(a.shorthandAssign=this.start),e.value=this.parseMaybeDefault(n,r,this.copyNode(e.key))):e.value=this.copyNode(e.key),e.shorthand=!0):this.unexpected();else {(i||s)&&this.unexpected(),e.kind=e.key.name,this.parsePropertyName(e),e.value=this.parseMethod(!1);var l="get"===e.kind?0:1;if(e.value.params.length!==l){var h=e.value.start;"get"===e.kind?this.raiseRecoverable(h,"getter should have no params"):this.raiseRecoverable(h,"setter should have exactly one param");}else "set"===e.kind&&"RestElement"===e.value.params[0].type&&this.raiseRecoverable(e.value.params[0].start,"Setter cannot use rest params");}},lo.parsePropertyName=function(e){if(this.options.ecmaVersion>=6){if(this.eat(Aa.bracketL))return e.computed=!0,e.key=this.parseMaybeAssign(),this.expect(Aa.bracketR),e.key;e.computed=!1;}return e.key=this.type===Aa.num||this.type===Aa.string?this.parseExprAtom():this.parseIdent("never"!==this.options.allowReserved)},lo.initFunction=function(e){e.id=null,this.options.ecmaVersion>=6&&(e.generator=e.expression=!1),this.options.ecmaVersion>=8&&(e.async=!1);},lo.parseMethod=function(e,t,i){var s=this.startNode(),n=this.yieldPos,r=this.awaitPos,a=this.awaitIdentPos;return this.initFunction(s),this.options.ecmaVersion>=6&&(s.generator=e),this.options.ecmaVersion>=8&&(s.async=!!t),this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,this.enterScope(64|Ga(t,s.generator)|(i?128:0)),this.expect(Aa.parenL),s.params=this.parseBindingList(Aa.parenR,!1,this.options.ecmaVersion>=8),this.checkYieldAwaitInDefaultParams(),this.parseFunctionBody(s,!1,!0,!1),this.yieldPos=n,this.awaitPos=r,this.awaitIdentPos=a,this.finishNode(s,"FunctionExpression")},lo.parseArrowExpression=function(e,t,i,s){var n=this.yieldPos,r=this.awaitPos,a=this.awaitIdentPos;return this.enterScope(16|Ga(i,!1)),this.initFunction(e),this.options.ecmaVersion>=8&&(e.async=!!i),this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,e.params=this.toAssignableList(t,!0),this.parseFunctionBody(e,!0,!1,s),this.yieldPos=n,this.awaitPos=r,this.awaitIdentPos=a,this.finishNode(e,"ArrowFunctionExpression")},lo.parseFunctionBody=function(e,t,i,s){var n=t&&this.type!==Aa.braceL,r=this.strict,a=!1;if(n)e.body=this.parseMaybeAssign(s),e.expression=!0,this.checkParams(e,!1);else {var o=this.options.ecmaVersion>=7&&!this.isSimpleParamList(e.params);r&&!o||(a=this.strictDirective(this.end))&&o&&this.raiseRecoverable(e.start,"Illegal 'use strict' directive in function with non-simple parameter list");var l=this.labels;this.labels=[],a&&(this.strict=!0),this.checkParams(e,!r&&!a&&!t&&!i&&this.isSimpleParamList(e.params)),this.strict&&e.id&&this.checkLValSimple(e.id,5),e.body=this.parseBlock(!1,void 0,a&&!r),e.expression=!1,this.adaptDirectivePrologue(e.body.body),this.labels=l;}this.exitScope();},lo.isSimpleParamList=function(e){for(var t=0,i=e;t<i.length;t+=1){if("Identifier"!==i[t].type)return !1}return !0},lo.checkParams=function(e,t){for(var i=Object.create(null),s=0,n=e.params;s<n.length;s+=1){var r=n[s];this.checkLValInnerPattern(r,1,t?null:i);}},lo.parseExprList=function(e,t,i,s){for(var n=[],r=!0;!this.eat(e);){if(r)r=!1;else if(this.expect(Aa.comma),t&&this.afterTrailingComma(e))break;var a=void 0;i&&this.type===Aa.comma?a=null:this.type===Aa.ellipsis?(a=this.parseSpread(s),s&&this.type===Aa.comma&&s.trailingComma<0&&(s.trailingComma=this.start)):a=this.parseMaybeAssign(!1,s),n.push(a);}return n},lo.checkUnreserved=function(e){var t=e.start,i=e.end,s=e.name;(this.inGenerator&&"yield"===s&&this.raiseRecoverable(t,"Cannot use 'yield' as identifier inside a generator"),this.inAsync&&"await"===s&&this.raiseRecoverable(t,"Cannot use 'await' as identifier inside an async function"),this.currentThisScope().inClassFieldInit&&"arguments"===s&&this.raiseRecoverable(t,"Cannot use 'arguments' in class field initializer"),!this.inClassStaticBlock||"arguments"!==s&&"await"!==s||this.raise(t,"Cannot use "+s+" in class static initialization block"),this.keywords.test(s)&&this.raise(t,"Unexpected keyword '"+s+"'"),this.options.ecmaVersion<6&&-1!==this.input.slice(t,i).indexOf("\\"))||(this.strict?this.reservedWordsStrict:this.reservedWords).test(s)&&(this.inAsync||"await"!==s||this.raiseRecoverable(t,"Cannot use keyword 'await' outside an async function"),this.raiseRecoverable(t,"The keyword '"+s+"' is reserved"));},lo.parseIdent=function(e,t){var i=this.startNode();return this.type===Aa.name?i.name=this.value:this.type.keyword?(i.name=this.type.keyword,"class"!==i.name&&"function"!==i.name||this.lastTokEnd===this.lastTokStart+1&&46===this.input.charCodeAt(this.lastTokStart)||this.context.pop()):this.unexpected(),this.next(!!e),this.finishNode(i,"Identifier"),e||(this.checkUnreserved(i),"await"!==i.name||this.awaitIdentPos||(this.awaitIdentPos=i.start)),i},lo.parsePrivateIdent=function(){var e=this.startNode();return this.type===Aa.privateId?e.name=this.value:this.unexpected(),this.next(),this.finishNode(e,"PrivateIdentifier"),0===this.privateNameStack.length?this.raise(e.start,"Private field '#"+e.name+"' must be declared in an enclosing class"):this.privateNameStack[this.privateNameStack.length-1].used.push(e),e},lo.parseYield=function(e){this.yieldPos||(this.yieldPos=this.start);var t=this.startNode();return this.next(),this.type===Aa.semi||this.canInsertSemicolon()||this.type!==Aa.star&&!this.type.startsExpr?(t.delegate=!1,t.argument=null):(t.delegate=this.eat(Aa.star),t.argument=this.parseMaybeAssign(e)),this.finishNode(t,"YieldExpression")},lo.parseAwait=function(e){this.awaitPos||(this.awaitPos=this.start);var t=this.startNode();return this.next(),t.argument=this.parseMaybeUnary(null,!0,!1,e),this.finishNode(t,"AwaitExpression")};var uo=Ha.prototype;uo.raise=function(e,t){var i=Fa(this.input,e);t+=" ("+i.line+":"+i.column+")";var s=new SyntaxError(t);throw s.pos=e,s.loc=i,s.raisedAt=this.pos,s},uo.raiseRecoverable=uo.raise,uo.curPosition=function(){if(this.options.locations)return new Va(this.curLine,this.pos-this.lineStart)};var po=Ha.prototype,fo=function(e){this.flags=e,this.var=[],this.lexical=[],this.functions=[],this.inClassFieldInit=!1;};po.enterScope=function(e){this.scopeStack.push(new fo(e));},po.exitScope=function(){this.scopeStack.pop();},po.treatFunctionsAsVarInScope=function(e){return 2&e.flags||!this.inModule&&1&e.flags},po.declareName=function(e,t,i){var s=!1;if(2===t){var n=this.currentScope();s=n.lexical.indexOf(e)>-1||n.functions.indexOf(e)>-1||n.var.indexOf(e)>-1,n.lexical.push(e),this.inModule&&1&n.flags&&delete this.undefinedExports[e];}else if(4===t){this.currentScope().lexical.push(e);}else if(3===t){var r=this.currentScope();s=this.treatFunctionsAsVar?r.lexical.indexOf(e)>-1:r.lexical.indexOf(e)>-1||r.var.indexOf(e)>-1,r.functions.push(e);}else for(var a=this.scopeStack.length-1;a>=0;--a){var o=this.scopeStack[a];if(o.lexical.indexOf(e)>-1&&!(32&o.flags&&o.lexical[0]===e)||!this.treatFunctionsAsVarInScope(o)&&o.functions.indexOf(e)>-1){s=!0;break}if(o.var.push(e),this.inModule&&1&o.flags&&delete this.undefinedExports[e],259&o.flags)break}s&&this.raiseRecoverable(i,"Identifier '"+e+"' has already been declared");},po.checkLocalExport=function(e){-1===this.scopeStack[0].lexical.indexOf(e.name)&&-1===this.scopeStack[0].var.indexOf(e.name)&&(this.undefinedExports[e.name]=e);},po.currentScope=function(){return this.scopeStack[this.scopeStack.length-1]},po.currentVarScope=function(){for(var e=this.scopeStack.length-1;;e--){var t=this.scopeStack[e];if(259&t.flags)return t}},po.currentThisScope=function(){for(var e=this.scopeStack.length-1;;e--){var t=this.scopeStack[e];if(259&t.flags&&!(16&t.flags))return t}};var mo=function(e,t,i){this.type="",this.start=t,this.end=0,e.options.locations&&(this.loc=new Ba(e,i)),e.options.directSourceFile&&(this.sourceFile=e.options.directSourceFile),e.options.ranges&&(this.range=[t,0]);},go=Ha.prototype;function yo(e,t,i,s){return e.type=t,e.end=i,this.options.locations&&(e.loc.end=s),this.options.ranges&&(e.range[1]=i),e}go.startNode=function(){return new mo(this,this.start,this.startLoc)},go.startNodeAt=function(e,t){return new mo(this,e,t)},go.finishNode=function(e,t){return yo.call(this,e,t,this.lastTokEnd,this.lastTokEndLoc)},go.finishNodeAt=function(e,t,i,s){return yo.call(this,e,t,i,s)},go.copyNode=function(e){var t=new mo(this,e.start,this.startLoc);for(var i in e)t[i]=e[i];return t};var xo="ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS",Eo=xo+" Extended_Pictographic",bo=Eo+" EBase EComp EMod EPres ExtPict",vo={9:xo,10:Eo,11:Eo,12:bo,13:"ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS Extended_Pictographic EBase EComp EMod EPres ExtPict"},So="Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu",Ao="Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb",Io=Ao+" Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd",ko=Io+" Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho",Po=ko+" Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi",wo={9:Ao,10:Io,11:ko,12:Po,13:"Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith"},Co={};function _o(e){var t=Co[e]={binary:Ma(vo[e]+" "+So),nonBinary:{General_Category:Ma(So),Script:Ma(wo[e])}};t.nonBinary.Script_Extensions=t.nonBinary.Script,t.nonBinary.gc=t.nonBinary.General_Category,t.nonBinary.sc=t.nonBinary.Script,t.nonBinary.scx=t.nonBinary.Script_Extensions;}for(var No=0,$o=[9,10,11,12,13];No<$o.length;No+=1){_o($o[No]);}var To=Ha.prototype,Oo=function(e){this.parser=e,this.validFlags="gim"+(e.options.ecmaVersion>=6?"uy":"")+(e.options.ecmaVersion>=9?"s":"")+(e.options.ecmaVersion>=13?"d":""),this.unicodeProperties=Co[e.options.ecmaVersion>=13?13:e.options.ecmaVersion],this.source="",this.flags="",this.start=0,this.switchU=!1,this.switchN=!1,this.pos=0,this.lastIntValue=0,this.lastStringValue="",this.lastAssertionIsQuantifiable=!1,this.numCapturingParens=0,this.maxBackReference=0,this.groupNames=[],this.backReferenceNames=[];};function Ro(e){return 36===e||e>=40&&e<=43||46===e||63===e||e>=91&&e<=94||e>=123&&e<=125}function Mo(e){return e>=65&&e<=90||e>=97&&e<=122}function Do(e){return Mo(e)||95===e}function Lo(e){return Do(e)||Vo(e)}function Vo(e){return e>=48&&e<=57}function Bo(e){return e>=48&&e<=57||e>=65&&e<=70||e>=97&&e<=102}function Fo(e){return e>=65&&e<=70?e-65+10:e>=97&&e<=102?e-97+10:e-48}function zo(e){return e>=48&&e<=55}Oo.prototype.reset=function(e,t,i){var s=-1!==i.indexOf("u");this.start=0|e,this.source=t+"",this.flags=i,this.switchU=s&&this.parser.options.ecmaVersion>=6,this.switchN=s&&this.parser.options.ecmaVersion>=9;},Oo.prototype.raise=function(e){this.parser.raiseRecoverable(this.start,"Invalid regular expression: /"+this.source+"/: "+e);},Oo.prototype.at=function(e,t){void 0===t&&(t=!1);var i=this.source,s=i.length;if(e>=s)return -1;var n=i.charCodeAt(e);if(!t&&!this.switchU||n<=55295||n>=57344||e+1>=s)return n;var r=i.charCodeAt(e+1);return r>=56320&&r<=57343?(n<<10)+r-56613888:n},Oo.prototype.nextIndex=function(e,t){void 0===t&&(t=!1);var i=this.source,s=i.length;if(e>=s)return s;var n,r=i.charCodeAt(e);return !t&&!this.switchU||r<=55295||r>=57344||e+1>=s||(n=i.charCodeAt(e+1))<56320||n>57343?e+1:e+2},Oo.prototype.current=function(e){return void 0===e&&(e=!1),this.at(this.pos,e)},Oo.prototype.lookahead=function(e){return void 0===e&&(e=!1),this.at(this.nextIndex(this.pos,e),e)},Oo.prototype.advance=function(e){void 0===e&&(e=!1),this.pos=this.nextIndex(this.pos,e);},Oo.prototype.eat=function(e,t){return void 0===t&&(t=!1),this.current(t)===e&&(this.advance(t),!0)},To.validateRegExpFlags=function(e){for(var t=e.validFlags,i=e.flags,s=0;s<i.length;s++){var n=i.charAt(s);-1===t.indexOf(n)&&this.raise(e.start,"Invalid regular expression flag"),i.indexOf(n,s+1)>-1&&this.raise(e.start,"Duplicate regular expression flag");}},To.validateRegExpPattern=function(e){this.regexp_pattern(e),!e.switchN&&this.options.ecmaVersion>=9&&e.groupNames.length>0&&(e.switchN=!0,this.regexp_pattern(e));},To.regexp_pattern=function(e){e.pos=0,e.lastIntValue=0,e.lastStringValue="",e.lastAssertionIsQuantifiable=!1,e.numCapturingParens=0,e.maxBackReference=0,e.groupNames.length=0,e.backReferenceNames.length=0,this.regexp_disjunction(e),e.pos!==e.source.length&&(e.eat(41)&&e.raise("Unmatched ')'"),(e.eat(93)||e.eat(125))&&e.raise("Lone quantifier brackets")),e.maxBackReference>e.numCapturingParens&&e.raise("Invalid escape");for(var t=0,i=e.backReferenceNames;t<i.length;t+=1){var s=i[t];-1===e.groupNames.indexOf(s)&&e.raise("Invalid named capture referenced");}},To.regexp_disjunction=function(e){for(this.regexp_alternative(e);e.eat(124);)this.regexp_alternative(e);this.regexp_eatQuantifier(e,!0)&&e.raise("Nothing to repeat"),e.eat(123)&&e.raise("Lone quantifier brackets");},To.regexp_alternative=function(e){for(;e.pos<e.source.length&&this.regexp_eatTerm(e););},To.regexp_eatTerm=function(e){return this.regexp_eatAssertion(e)?(e.lastAssertionIsQuantifiable&&this.regexp_eatQuantifier(e)&&e.switchU&&e.raise("Invalid quantifier"),!0):!!(e.switchU?this.regexp_eatAtom(e):this.regexp_eatExtendedAtom(e))&&(this.regexp_eatQuantifier(e),!0)},To.regexp_eatAssertion=function(e){var t=e.pos;if(e.lastAssertionIsQuantifiable=!1,e.eat(94)||e.eat(36))return !0;if(e.eat(92)){if(e.eat(66)||e.eat(98))return !0;e.pos=t;}if(e.eat(40)&&e.eat(63)){var i=!1;if(this.options.ecmaVersion>=9&&(i=e.eat(60)),e.eat(61)||e.eat(33))return this.regexp_disjunction(e),e.eat(41)||e.raise("Unterminated group"),e.lastAssertionIsQuantifiable=!i,!0}return e.pos=t,!1},To.regexp_eatQuantifier=function(e,t){return void 0===t&&(t=!1),!!this.regexp_eatQuantifierPrefix(e,t)&&(e.eat(63),!0)},To.regexp_eatQuantifierPrefix=function(e,t){return e.eat(42)||e.eat(43)||e.eat(63)||this.regexp_eatBracedQuantifier(e,t)},To.regexp_eatBracedQuantifier=function(e,t){var i=e.pos;if(e.eat(123)){var s=0,n=-1;if(this.regexp_eatDecimalDigits(e)&&(s=e.lastIntValue,e.eat(44)&&this.regexp_eatDecimalDigits(e)&&(n=e.lastIntValue),e.eat(125)))return -1!==n&&n<s&&!t&&e.raise("numbers out of order in {} quantifier"),!0;e.switchU&&!t&&e.raise("Incomplete quantifier"),e.pos=i;}return !1},To.regexp_eatAtom=function(e){return this.regexp_eatPatternCharacters(e)||e.eat(46)||this.regexp_eatReverseSolidusAtomEscape(e)||this.regexp_eatCharacterClass(e)||this.regexp_eatUncapturingGroup(e)||this.regexp_eatCapturingGroup(e)},To.regexp_eatReverseSolidusAtomEscape=function(e){var t=e.pos;if(e.eat(92)){if(this.regexp_eatAtomEscape(e))return !0;e.pos=t;}return !1},To.regexp_eatUncapturingGroup=function(e){var t=e.pos;if(e.eat(40)){if(e.eat(63)&&e.eat(58)){if(this.regexp_disjunction(e),e.eat(41))return !0;e.raise("Unterminated group");}e.pos=t;}return !1},To.regexp_eatCapturingGroup=function(e){if(e.eat(40)){if(this.options.ecmaVersion>=9?this.regexp_groupSpecifier(e):63===e.current()&&e.raise("Invalid group"),this.regexp_disjunction(e),e.eat(41))return e.numCapturingParens+=1,!0;e.raise("Unterminated group");}return !1},To.regexp_eatExtendedAtom=function(e){return e.eat(46)||this.regexp_eatReverseSolidusAtomEscape(e)||this.regexp_eatCharacterClass(e)||this.regexp_eatUncapturingGroup(e)||this.regexp_eatCapturingGroup(e)||this.regexp_eatInvalidBracedQuantifier(e)||this.regexp_eatExtendedPatternCharacter(e)},To.regexp_eatInvalidBracedQuantifier=function(e){return this.regexp_eatBracedQuantifier(e,!0)&&e.raise("Nothing to repeat"),!1},To.regexp_eatSyntaxCharacter=function(e){var t=e.current();return !!Ro(t)&&(e.lastIntValue=t,e.advance(),!0)},To.regexp_eatPatternCharacters=function(e){for(var t=e.pos,i=0;-1!==(i=e.current())&&!Ro(i);)e.advance();return e.pos!==t},To.regexp_eatExtendedPatternCharacter=function(e){var t=e.current();return !(-1===t||36===t||t>=40&&t<=43||46===t||63===t||91===t||94===t||124===t)&&(e.advance(),!0)},To.regexp_groupSpecifier=function(e){if(e.eat(63)){if(this.regexp_eatGroupName(e))return -1!==e.groupNames.indexOf(e.lastStringValue)&&e.raise("Duplicate capture group name"),void e.groupNames.push(e.lastStringValue);e.raise("Invalid group");}},To.regexp_eatGroupName=function(e){if(e.lastStringValue="",e.eat(60)){if(this.regexp_eatRegExpIdentifierName(e)&&e.eat(62))return !0;e.raise("Invalid capture group name");}return !1},To.regexp_eatRegExpIdentifierName=function(e){if(e.lastStringValue="",this.regexp_eatRegExpIdentifierStart(e)){for(e.lastStringValue+=Da(e.lastIntValue);this.regexp_eatRegExpIdentifierPart(e);)e.lastStringValue+=Da(e.lastIntValue);return !0}return !1},To.regexp_eatRegExpIdentifierStart=function(e){var t=e.pos,i=this.options.ecmaVersion>=11,s=e.current(i);return e.advance(i),92===s&&this.regexp_eatRegExpUnicodeEscapeSequence(e,i)&&(s=e.lastIntValue),function(e){return ma(e,!0)||36===e||95===e}(s)?(e.lastIntValue=s,!0):(e.pos=t,!1)},To.regexp_eatRegExpIdentifierPart=function(e){var t=e.pos,i=this.options.ecmaVersion>=11,s=e.current(i);return e.advance(i),92===s&&this.regexp_eatRegExpUnicodeEscapeSequence(e,i)&&(s=e.lastIntValue),function(e){return ga(e,!0)||36===e||95===e||8204===e||8205===e}(s)?(e.lastIntValue=s,!0):(e.pos=t,!1)},To.regexp_eatAtomEscape=function(e){return !!(this.regexp_eatBackReference(e)||this.regexp_eatCharacterClassEscape(e)||this.regexp_eatCharacterEscape(e)||e.switchN&&this.regexp_eatKGroupName(e))||(e.switchU&&(99===e.current()&&e.raise("Invalid unicode escape"),e.raise("Invalid escape")),!1)},To.regexp_eatBackReference=function(e){var t=e.pos;if(this.regexp_eatDecimalEscape(e)){var i=e.lastIntValue;if(e.switchU)return i>e.maxBackReference&&(e.maxBackReference=i),!0;if(i<=e.numCapturingParens)return !0;e.pos=t;}return !1},To.regexp_eatKGroupName=function(e){if(e.eat(107)){if(this.regexp_eatGroupName(e))return e.backReferenceNames.push(e.lastStringValue),!0;e.raise("Invalid named reference");}return !1},To.regexp_eatCharacterEscape=function(e){return this.regexp_eatControlEscape(e)||this.regexp_eatCControlLetter(e)||this.regexp_eatZero(e)||this.regexp_eatHexEscapeSequence(e)||this.regexp_eatRegExpUnicodeEscapeSequence(e,!1)||!e.switchU&&this.regexp_eatLegacyOctalEscapeSequence(e)||this.regexp_eatIdentityEscape(e)},To.regexp_eatCControlLetter=function(e){var t=e.pos;if(e.eat(99)){if(this.regexp_eatControlLetter(e))return !0;e.pos=t;}return !1},To.regexp_eatZero=function(e){return 48===e.current()&&!Vo(e.lookahead())&&(e.lastIntValue=0,e.advance(),!0)},To.regexp_eatControlEscape=function(e){var t=e.current();return 116===t?(e.lastIntValue=9,e.advance(),!0):110===t?(e.lastIntValue=10,e.advance(),!0):118===t?(e.lastIntValue=11,e.advance(),!0):102===t?(e.lastIntValue=12,e.advance(),!0):114===t&&(e.lastIntValue=13,e.advance(),!0)},To.regexp_eatControlLetter=function(e){var t=e.current();return !!Mo(t)&&(e.lastIntValue=t%32,e.advance(),!0)},To.regexp_eatRegExpUnicodeEscapeSequence=function(e,t){void 0===t&&(t=!1);var i,s=e.pos,n=t||e.switchU;if(e.eat(117)){if(this.regexp_eatFixedHexDigits(e,4)){var r=e.lastIntValue;if(n&&r>=55296&&r<=56319){var a=e.pos;if(e.eat(92)&&e.eat(117)&&this.regexp_eatFixedHexDigits(e,4)){var o=e.lastIntValue;if(o>=56320&&o<=57343)return e.lastIntValue=1024*(r-55296)+(o-56320)+65536,!0}e.pos=a,e.lastIntValue=r;}return !0}if(n&&e.eat(123)&&this.regexp_eatHexDigits(e)&&e.eat(125)&&((i=e.lastIntValue)>=0&&i<=1114111))return !0;n&&e.raise("Invalid unicode escape"),e.pos=s;}return !1},To.regexp_eatIdentityEscape=function(e){if(e.switchU)return !!this.regexp_eatSyntaxCharacter(e)||!!e.eat(47)&&(e.lastIntValue=47,!0);var t=e.current();return !(99===t||e.switchN&&107===t)&&(e.lastIntValue=t,e.advance(),!0)},To.regexp_eatDecimalEscape=function(e){e.lastIntValue=0;var t=e.current();if(t>=49&&t<=57){do{e.lastIntValue=10*e.lastIntValue+(t-48),e.advance();}while((t=e.current())>=48&&t<=57);return !0}return !1},To.regexp_eatCharacterClassEscape=function(e){var t=e.current();if(function(e){return 100===e||68===e||115===e||83===e||119===e||87===e}(t))return e.lastIntValue=-1,e.advance(),!0;if(e.switchU&&this.options.ecmaVersion>=9&&(80===t||112===t)){if(e.lastIntValue=-1,e.advance(),e.eat(123)&&this.regexp_eatUnicodePropertyValueExpression(e)&&e.eat(125))return !0;e.raise("Invalid property name");}return !1},To.regexp_eatUnicodePropertyValueExpression=function(e){var t=e.pos;if(this.regexp_eatUnicodePropertyName(e)&&e.eat(61)){var i=e.lastStringValue;if(this.regexp_eatUnicodePropertyValue(e)){var s=e.lastStringValue;return this.regexp_validateUnicodePropertyNameAndValue(e,i,s),!0}}if(e.pos=t,this.regexp_eatLoneUnicodePropertyNameOrValue(e)){var n=e.lastStringValue;return this.regexp_validateUnicodePropertyNameOrValue(e,n),!0}return !1},To.regexp_validateUnicodePropertyNameAndValue=function(e,t,i){Oa(e.unicodeProperties.nonBinary,t)||e.raise("Invalid property name"),e.unicodeProperties.nonBinary[t].test(i)||e.raise("Invalid property value");},To.regexp_validateUnicodePropertyNameOrValue=function(e,t){e.unicodeProperties.binary.test(t)||e.raise("Invalid property name");},To.regexp_eatUnicodePropertyName=function(e){var t=0;for(e.lastStringValue="";Do(t=e.current());)e.lastStringValue+=Da(t),e.advance();return ""!==e.lastStringValue},To.regexp_eatUnicodePropertyValue=function(e){var t=0;for(e.lastStringValue="";Lo(t=e.current());)e.lastStringValue+=Da(t),e.advance();return ""!==e.lastStringValue},To.regexp_eatLoneUnicodePropertyNameOrValue=function(e){return this.regexp_eatUnicodePropertyValue(e)},To.regexp_eatCharacterClass=function(e){if(e.eat(91)){if(e.eat(94),this.regexp_classRanges(e),e.eat(93))return !0;e.raise("Unterminated character class");}return !1},To.regexp_classRanges=function(e){for(;this.regexp_eatClassAtom(e);){var t=e.lastIntValue;if(e.eat(45)&&this.regexp_eatClassAtom(e)){var i=e.lastIntValue;!e.switchU||-1!==t&&-1!==i||e.raise("Invalid character class"),-1!==t&&-1!==i&&t>i&&e.raise("Range out of order in character class");}}},To.regexp_eatClassAtom=function(e){var t=e.pos;if(e.eat(92)){if(this.regexp_eatClassEscape(e))return !0;if(e.switchU){var i=e.current();(99===i||zo(i))&&e.raise("Invalid class escape"),e.raise("Invalid escape");}e.pos=t;}var s=e.current();return 93!==s&&(e.lastIntValue=s,e.advance(),!0)},To.regexp_eatClassEscape=function(e){var t=e.pos;if(e.eat(98))return e.lastIntValue=8,!0;if(e.switchU&&e.eat(45))return e.lastIntValue=45,!0;if(!e.switchU&&e.eat(99)){if(this.regexp_eatClassControlLetter(e))return !0;e.pos=t;}return this.regexp_eatCharacterClassEscape(e)||this.regexp_eatCharacterEscape(e)},To.regexp_eatClassControlLetter=function(e){var t=e.current();return !(!Vo(t)&&95!==t)&&(e.lastIntValue=t%32,e.advance(),!0)},To.regexp_eatHexEscapeSequence=function(e){var t=e.pos;if(e.eat(120)){if(this.regexp_eatFixedHexDigits(e,2))return !0;e.switchU&&e.raise("Invalid escape"),e.pos=t;}return !1},To.regexp_eatDecimalDigits=function(e){var t=e.pos,i=0;for(e.lastIntValue=0;Vo(i=e.current());)e.lastIntValue=10*e.lastIntValue+(i-48),e.advance();return e.pos!==t},To.regexp_eatHexDigits=function(e){var t=e.pos,i=0;for(e.lastIntValue=0;Bo(i=e.current());)e.lastIntValue=16*e.lastIntValue+Fo(i),e.advance();return e.pos!==t},To.regexp_eatLegacyOctalEscapeSequence=function(e){if(this.regexp_eatOctalDigit(e)){var t=e.lastIntValue;if(this.regexp_eatOctalDigit(e)){var i=e.lastIntValue;t<=3&&this.regexp_eatOctalDigit(e)?e.lastIntValue=64*t+8*i+e.lastIntValue:e.lastIntValue=8*t+i;}else e.lastIntValue=t;return !0}return !1},To.regexp_eatOctalDigit=function(e){var t=e.current();return zo(t)?(e.lastIntValue=t-48,e.advance(),!0):(e.lastIntValue=0,!1)},To.regexp_eatFixedHexDigits=function(e,t){var i=e.pos;e.lastIntValue=0;for(var s=0;s<t;++s){var n=e.current();if(!Bo(n))return e.pos=i,!1;e.lastIntValue=16*e.lastIntValue+Fo(n),e.advance();}return !0};var jo=function(e){this.type=e.type,this.value=e.value,this.start=e.start,this.end=e.end,e.options.locations&&(this.loc=new Ba(e,e.startLoc,e.endLoc)),e.options.ranges&&(this.range=[e.start,e.end]);},Uo=Ha.prototype;function Go(e){return "function"!=typeof BigInt?null:BigInt(e.replace(/_/g,""))}Uo.next=function(e){!e&&this.type.keyword&&this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword "+this.type.keyword),this.options.onToken&&this.options.onToken(new jo(this)),this.lastTokEnd=this.end,this.lastTokStart=this.start,this.lastTokEndLoc=this.endLoc,this.lastTokStartLoc=this.startLoc,this.nextToken();},Uo.getToken=function(){return this.next(),new jo(this)},"undefined"!=typeof Symbol&&(Uo[Symbol.iterator]=function(){var e=this;return {next:function(){var t=e.getToken();return {done:t.type===Aa.eof,value:t}}}}),Uo.nextToken=function(){var e=this.curContext();return e&&e.preserveSpace||this.skipSpace(),this.start=this.pos,this.options.locations&&(this.startLoc=this.curPosition()),this.pos>=this.input.length?this.finishToken(Aa.eof):e.override?e.override(this):void this.readToken(this.fullCharCodeAtPos())},Uo.readToken=function(e){return ma(e,this.options.ecmaVersion>=6)||92===e?this.readWord():this.getTokenFromCode(e)},Uo.fullCharCodeAtPos=function(){var e=this.input.charCodeAt(this.pos);if(e<=55295||e>=56320)return e;var t=this.input.charCodeAt(this.pos+1);return t<=56319||t>=57344?e:(e<<10)+t-56613888},Uo.skipBlockComment=function(){var e=this.options.onComment&&this.curPosition(),t=this.pos,i=this.input.indexOf("*/",this.pos+=2);if(-1===i&&this.raise(this.pos-2,"Unterminated comment"),this.pos=i+2,this.options.locations)for(var s=void 0,n=t;(s=wa(this.input,n,this.pos))>-1;)++this.curLine,n=this.lineStart=s;this.options.onComment&&this.options.onComment(!0,this.input.slice(t+2,i),t,this.pos,e,this.curPosition());},Uo.skipLineComment=function(e){for(var t=this.pos,i=this.options.onComment&&this.curPosition(),s=this.input.charCodeAt(this.pos+=e);this.pos<this.input.length&&!Pa(s);)s=this.input.charCodeAt(++this.pos);this.options.onComment&&this.options.onComment(!1,this.input.slice(t+e,this.pos),t,this.pos,i,this.curPosition());},Uo.skipSpace=function(){e:for(;this.pos<this.input.length;){var e=this.input.charCodeAt(this.pos);switch(e){case 32:case 160:++this.pos;break;case 13:10===this.input.charCodeAt(this.pos+1)&&++this.pos;case 10:case 8232:case 8233:++this.pos,this.options.locations&&(++this.curLine,this.lineStart=this.pos);break;case 47:switch(this.input.charCodeAt(this.pos+1)){case 42:this.skipBlockComment();break;case 47:this.skipLineComment(2);break;default:break e}break;default:if(!(e>8&&e<14||e>=5760&&Ca.test(String.fromCharCode(e))))break e;++this.pos;}}},Uo.finishToken=function(e,t){this.end=this.pos,this.options.locations&&(this.endLoc=this.curPosition());var i=this.type;this.type=e,this.value=t,this.updateContext(i);},Uo.readToken_dot=function(){var e=this.input.charCodeAt(this.pos+1);if(e>=48&&e<=57)return this.readNumber(!0);var t=this.input.charCodeAt(this.pos+2);return this.options.ecmaVersion>=6&&46===e&&46===t?(this.pos+=3,this.finishToken(Aa.ellipsis)):(++this.pos,this.finishToken(Aa.dot))},Uo.readToken_slash=function(){var e=this.input.charCodeAt(this.pos+1);return this.exprAllowed?(++this.pos,this.readRegexp()):61===e?this.finishOp(Aa.assign,2):this.finishOp(Aa.slash,1)},Uo.readToken_mult_modulo_exp=function(e){var t=this.input.charCodeAt(this.pos+1),i=1,s=42===e?Aa.star:Aa.modulo;return this.options.ecmaVersion>=7&&42===e&&42===t&&(++i,s=Aa.starstar,t=this.input.charCodeAt(this.pos+2)),61===t?this.finishOp(Aa.assign,i+1):this.finishOp(s,i)},Uo.readToken_pipe_amp=function(e){var t=this.input.charCodeAt(this.pos+1);if(t===e){if(this.options.ecmaVersion>=12)if(61===this.input.charCodeAt(this.pos+2))return this.finishOp(Aa.assign,3);return this.finishOp(124===e?Aa.logicalOR:Aa.logicalAND,2)}return 61===t?this.finishOp(Aa.assign,2):this.finishOp(124===e?Aa.bitwiseOR:Aa.bitwiseAND,1)},Uo.readToken_caret=function(){return 61===this.input.charCodeAt(this.pos+1)?this.finishOp(Aa.assign,2):this.finishOp(Aa.bitwiseXOR,1)},Uo.readToken_plus_min=function(e){var t=this.input.charCodeAt(this.pos+1);return t===e?45!==t||this.inModule||62!==this.input.charCodeAt(this.pos+2)||0!==this.lastTokEnd&&!Ia.test(this.input.slice(this.lastTokEnd,this.pos))?this.finishOp(Aa.incDec,2):(this.skipLineComment(3),this.skipSpace(),this.nextToken()):61===t?this.finishOp(Aa.assign,2):this.finishOp(Aa.plusMin,1)},Uo.readToken_lt_gt=function(e){var t=this.input.charCodeAt(this.pos+1),i=1;return t===e?(i=62===e&&62===this.input.charCodeAt(this.pos+2)?3:2,61===this.input.charCodeAt(this.pos+i)?this.finishOp(Aa.assign,i+1):this.finishOp(Aa.bitShift,i)):33!==t||60!==e||this.inModule||45!==this.input.charCodeAt(this.pos+2)||45!==this.input.charCodeAt(this.pos+3)?(61===t&&(i=2),this.finishOp(Aa.relational,i)):(this.skipLineComment(4),this.skipSpace(),this.nextToken())},Uo.readToken_eq_excl=function(e){var t=this.input.charCodeAt(this.pos+1);return 61===t?this.finishOp(Aa.equality,61===this.input.charCodeAt(this.pos+2)?3:2):61===e&&62===t&&this.options.ecmaVersion>=6?(this.pos+=2,this.finishToken(Aa.arrow)):this.finishOp(61===e?Aa.eq:Aa.prefix,1)},Uo.readToken_question=function(){var e=this.options.ecmaVersion;if(e>=11){var t=this.input.charCodeAt(this.pos+1);if(46===t){var i=this.input.charCodeAt(this.pos+2);if(i<48||i>57)return this.finishOp(Aa.questionDot,2)}if(63===t){if(e>=12)if(61===this.input.charCodeAt(this.pos+2))return this.finishOp(Aa.assign,3);return this.finishOp(Aa.coalesce,2)}}return this.finishOp(Aa.question,1)},Uo.readToken_numberSign=function(){var e=35;if(this.options.ecmaVersion>=13&&(++this.pos,ma(e=this.fullCharCodeAtPos(),!0)||92===e))return this.finishToken(Aa.privateId,this.readWord1());this.raise(this.pos,"Unexpected character '"+Da(e)+"'");},Uo.getTokenFromCode=function(e){switch(e){case 46:return this.readToken_dot();case 40:return ++this.pos,this.finishToken(Aa.parenL);case 41:return ++this.pos,this.finishToken(Aa.parenR);case 59:return ++this.pos,this.finishToken(Aa.semi);case 44:return ++this.pos,this.finishToken(Aa.comma);case 91:return ++this.pos,this.finishToken(Aa.bracketL);case 93:return ++this.pos,this.finishToken(Aa.bracketR);case 123:return ++this.pos,this.finishToken(Aa.braceL);case 125:return ++this.pos,this.finishToken(Aa.braceR);case 58:return ++this.pos,this.finishToken(Aa.colon);case 96:if(this.options.ecmaVersion<6)break;return ++this.pos,this.finishToken(Aa.backQuote);case 48:var t=this.input.charCodeAt(this.pos+1);if(120===t||88===t)return this.readRadixNumber(16);if(this.options.ecmaVersion>=6){if(111===t||79===t)return this.readRadixNumber(8);if(98===t||66===t)return this.readRadixNumber(2)}case 49:case 50:case 51:case 52:case 53:case 54:case 55:case 56:case 57:return this.readNumber(!1);case 34:case 39:return this.readString(e);case 47:return this.readToken_slash();case 37:case 42:return this.readToken_mult_modulo_exp(e);case 124:case 38:return this.readToken_pipe_amp(e);case 94:return this.readToken_caret();case 43:case 45:return this.readToken_plus_min(e);case 60:case 62:return this.readToken_lt_gt(e);case 61:case 33:return this.readToken_eq_excl(e);case 63:return this.readToken_question();case 126:return this.finishOp(Aa.prefix,1);case 35:return this.readToken_numberSign()}this.raise(this.pos,"Unexpected character '"+Da(e)+"'");},Uo.finishOp=function(e,t){var i=this.input.slice(this.pos,this.pos+t);return this.pos+=t,this.finishToken(e,i)},Uo.readRegexp=function(){for(var e,t,i=this.pos;;){this.pos>=this.input.length&&this.raise(i,"Unterminated regular expression");var s=this.input.charAt(this.pos);if(Ia.test(s)&&this.raise(i,"Unterminated regular expression"),e)e=!1;else {if("["===s)t=!0;else if("]"===s&&t)t=!1;else if("/"===s&&!t)break;e="\\"===s;}++this.pos;}var n=this.input.slice(i,this.pos);++this.pos;var r=this.pos,a=this.readWord1();this.containsEsc&&this.unexpected(r);var o=this.regexpState||(this.regexpState=new Oo(this));o.reset(i,n,a),this.validateRegExpFlags(o),this.validateRegExpPattern(o);var l=null;try{l=new RegExp(n,a);}catch(e){}return this.finishToken(Aa.regexp,{pattern:n,flags:a,value:l})},Uo.readInt=function(e,t,i){for(var s=this.options.ecmaVersion>=12&&void 0===t,n=i&&48===this.input.charCodeAt(this.pos),r=this.pos,a=0,o=0,l=0,h=null==t?1/0:t;l<h;++l,++this.pos){var c=this.input.charCodeAt(this.pos),u=void 0;if(s&&95===c)n&&this.raiseRecoverable(this.pos,"Numeric separator is not allowed in legacy octal numeric literals"),95===o&&this.raiseRecoverable(this.pos,"Numeric separator must be exactly one underscore"),0===l&&this.raiseRecoverable(this.pos,"Numeric separator is not allowed at the first of digits"),o=c;else {if((u=c>=97?c-97+10:c>=65?c-65+10:c>=48&&c<=57?c-48:1/0)>=e)break;o=c,a=a*e+u;}}return s&&95===o&&this.raiseRecoverable(this.pos-1,"Numeric separator is not allowed at the last of digits"),this.pos===r||null!=t&&this.pos-r!==t?null:a},Uo.readRadixNumber=function(e){var t=this.pos;this.pos+=2;var i=this.readInt(e);return null==i&&this.raise(this.start+2,"Expected number in radix "+e),this.options.ecmaVersion>=11&&110===this.input.charCodeAt(this.pos)?(i=Go(this.input.slice(t,this.pos)),++this.pos):ma(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number"),this.finishToken(Aa.num,i)},Uo.readNumber=function(e){var t=this.pos;e||null!==this.readInt(10,void 0,!0)||this.raise(t,"Invalid number");var i=this.pos-t>=2&&48===this.input.charCodeAt(t);i&&this.strict&&this.raise(t,"Invalid number");var s=this.input.charCodeAt(this.pos);if(!i&&!e&&this.options.ecmaVersion>=11&&110===s){var n=Go(this.input.slice(t,this.pos));return ++this.pos,ma(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number"),this.finishToken(Aa.num,n)}i&&/[89]/.test(this.input.slice(t,this.pos))&&(i=!1),46!==s||i||(++this.pos,this.readInt(10),s=this.input.charCodeAt(this.pos)),69!==s&&101!==s||i||(43!==(s=this.input.charCodeAt(++this.pos))&&45!==s||++this.pos,null===this.readInt(10)&&this.raise(t,"Invalid number")),ma(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number");var r,a=(r=this.input.slice(t,this.pos),i?parseInt(r,8):parseFloat(r.replace(/_/g,"")));return this.finishToken(Aa.num,a)},Uo.readCodePoint=function(){var e;if(123===this.input.charCodeAt(this.pos)){this.options.ecmaVersion<6&&this.unexpected();var t=++this.pos;e=this.readHexChar(this.input.indexOf("}",this.pos)-this.pos),++this.pos,e>1114111&&this.invalidStringToken(t,"Code point out of bounds");}else e=this.readHexChar(4);return e},Uo.readString=function(e){for(var t="",i=++this.pos;;){this.pos>=this.input.length&&this.raise(this.start,"Unterminated string constant");var s=this.input.charCodeAt(this.pos);if(s===e)break;92===s?(t+=this.input.slice(i,this.pos),t+=this.readEscapedChar(!1),i=this.pos):8232===s||8233===s?(this.options.ecmaVersion<10&&this.raise(this.start,"Unterminated string constant"),++this.pos,this.options.locations&&(this.curLine++,this.lineStart=this.pos)):(Pa(s)&&this.raise(this.start,"Unterminated string constant"),++this.pos);}return t+=this.input.slice(i,this.pos++),this.finishToken(Aa.string,t)};var Ho={};Uo.tryReadTemplateToken=function(){this.inTemplateElement=!0;try{this.readTmplToken();}catch(e){if(e!==Ho)throw e;this.readInvalidTemplateToken();}this.inTemplateElement=!1;},Uo.invalidStringToken=function(e,t){if(this.inTemplateElement&&this.options.ecmaVersion>=9)throw Ho;this.raise(e,t);},Uo.readTmplToken=function(){for(var e="",t=this.pos;;){this.pos>=this.input.length&&this.raise(this.start,"Unterminated template");var i=this.input.charCodeAt(this.pos);if(96===i||36===i&&123===this.input.charCodeAt(this.pos+1))return this.pos!==this.start||this.type!==Aa.template&&this.type!==Aa.invalidTemplate?(e+=this.input.slice(t,this.pos),this.finishToken(Aa.template,e)):36===i?(this.pos+=2,this.finishToken(Aa.dollarBraceL)):(++this.pos,this.finishToken(Aa.backQuote));if(92===i)e+=this.input.slice(t,this.pos),e+=this.readEscapedChar(!0),t=this.pos;else if(Pa(i)){switch(e+=this.input.slice(t,this.pos),++this.pos,i){case 13:10===this.input.charCodeAt(this.pos)&&++this.pos;case 10:e+="\n";break;default:e+=String.fromCharCode(i);}this.options.locations&&(++this.curLine,this.lineStart=this.pos),t=this.pos;}else ++this.pos;}},Uo.readInvalidTemplateToken=function(){for(;this.pos<this.input.length;this.pos++)switch(this.input[this.pos]){case"\\":++this.pos;break;case"$":if("{"!==this.input[this.pos+1])break;case"`":return this.finishToken(Aa.invalidTemplate,this.input.slice(this.start,this.pos))}this.raise(this.start,"Unterminated template");},Uo.readEscapedChar=function(e){var t=this.input.charCodeAt(++this.pos);switch(++this.pos,t){case 110:return "\n";case 114:return "\r";case 120:return String.fromCharCode(this.readHexChar(2));case 117:return Da(this.readCodePoint());case 116:return "\t";case 98:return "\b";case 118:return "\v";case 102:return "\f";case 13:10===this.input.charCodeAt(this.pos)&&++this.pos;case 10:return this.options.locations&&(this.lineStart=this.pos,++this.curLine),"";case 56:case 57:if(this.strict&&this.invalidStringToken(this.pos-1,"Invalid escape sequence"),e){var i=this.pos-1;return this.invalidStringToken(i,"Invalid escape sequence in template string"),null}default:if(t>=48&&t<=55){var s=this.input.substr(this.pos-1,3).match(/^[0-7]+/)[0],n=parseInt(s,8);return n>255&&(s=s.slice(0,-1),n=parseInt(s,8)),this.pos+=s.length-1,t=this.input.charCodeAt(this.pos),"0"===s&&56!==t&&57!==t||!this.strict&&!e||this.invalidStringToken(this.pos-1-s.length,e?"Octal literal in template string":"Octal literal in strict mode"),String.fromCharCode(n)}return Pa(t)?"":String.fromCharCode(t)}},Uo.readHexChar=function(e){var t=this.pos,i=this.readInt(16,e);return null===i&&this.invalidStringToken(t,"Bad character escape sequence"),i},Uo.readWord1=function(){this.containsEsc=!1;for(var e="",t=!0,i=this.pos,s=this.options.ecmaVersion>=6;this.pos<this.input.length;){var n=this.fullCharCodeAtPos();if(ga(n,s))this.pos+=n<=65535?1:2;else {if(92!==n)break;this.containsEsc=!0,e+=this.input.slice(i,this.pos);var r=this.pos;117!==this.input.charCodeAt(++this.pos)&&this.invalidStringToken(this.pos,"Expecting Unicode escape sequence \\uXXXX"),++this.pos;var a=this.readCodePoint();(t?ma:ga)(a,s)||this.invalidStringToken(r,"Invalid Unicode escape"),e+=Da(a),i=this.pos;}t=!1;}return e+this.input.slice(i,this.pos)},Uo.readWord=function(){var e=this.readWord1(),t=Aa.name;return this.keywords.test(e)&&(t=va[e]),this.finishToken(t,e)};Ha.acorn={Parser:Ha,version:"8.7.1",defaultOptions:za,Position:Va,SourceLocation:Ba,getLineInfo:Fa,Node:mo,TokenType:ya,tokTypes:Aa,keywordTypes:va,TokContext:ro,tokContexts:ao,isIdentifierChar:ga,isIdentifierStart:ma,Token:jo,isNewLine:Pa,lineBreak:Ia,lineBreakG:ka,nonASCIIwhitespace:Ca};const Wo=e=>()=>{pe({code:"NO_FS_IN_BROWSER",message:`Cannot access the file system (via "${e}") when using the browser build of Rollup. Make sure you supply a plugin with custom resolveId and load hooks to Rollup.`,url:"https://rollupjs.org/guide/en/#a-simple-example"});},qo={mkdir:Wo("fs.mkdir"),readFile:Wo("fs.readFile"),writeFile:Wo("fs.writeFile")};async function Ko(e,t,i,s,n,r,a,o){const l=await function(e,t,i,s,n,r,a){let o=null,l=null;if(n){o=new Set;for(const i of n)e===i.source&&t===i.importer&&o.add(i.plugin);l=(e,t)=>({...e,resolve:(e,i,{custom:r,isEntry:a,skipSelf:o}=ie)=>s(e,i,r,a,o?[...n,{importer:i,plugin:t,source:e}]:n)});}return i.hookFirst("resolveId",[e,t,{custom:r,isEntry:a}],l,o)}(e,t,s,n,r,a,o);return l}function Xo(e,t,{hook:i,id:s}={}){return "string"==typeof e&&(e={message:e}),e.code&&e.code!==me.PLUGIN_ERROR&&(e.pluginCode=e.code),e.code=me.PLUGIN_ERROR,e.plugin=t,i&&(e.hook=i),s&&(e.id=s),pe(e)}const Yo=[{active:!0,deprecated:"resolveAssetUrl",replacement:"resolveFileUrl"}];const Qo={delete:()=>!1,get(){},has:()=>!1,set(){}};function Zo(e){return e.startsWith("at position ")||e.startsWith("at output position ")?pe({code:"ANONYMOUS_PLUGIN_CACHE",message:"A plugin is trying to use the Rollup cache but is not declaring a plugin name or cacheKey."}):pe({code:"DUPLICATE_PLUGIN_NAME",message:`The plugin name ${e} is being used twice in the same build. Plugin names must be distinct or provide a cacheKey (please post an issue to the plugin if you are a plugin user).`})}async function Jo(e,t,i,s){const n=t.id,r=[];let a=null===e.map?null:Or(e.map);const o=e.code;let l=e.ast;const c=[],u=[];let d=!1;const p=()=>d=!0;let f="";const m=e.code;let g;try{g=await i.hookReduceArg0("transform",[m,n],(function(e,i,n){let a,o;if("string"==typeof i)a=i;else {if(!i||"object"!=typeof i)return e;if(t.updateOptions(i),null==i.code)return (i.map||i.ast)&&s(function(e){return {code:me.NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE,message:`The plugin "${e}" returned a "map" or "ast" without returning a "code". This will be ignored.`}}(n.name)),e;({code:a,map:o,ast:l}=i);}return null!==o&&r.push(Or("string"==typeof o?JSON.parse(o):o)||{missing:!0,plugin:n.name}),a}),((e,t)=>{return f=t.name,{...e,addWatchFile(t){c.push(t),e.addWatchFile(t);},cache:d?e.cache:(l=e.cache,g=p,{delete:e=>(g(),l.delete(e)),get:e=>(g(),l.get(e)),has:e=>(g(),l.has(e)),set:(e,t)=>(g(),l.set(e,t))}),emitAsset:(t,i)=>(u.push({name:t,source:i,type:"asset"}),e.emitAsset(t,i)),emitChunk:(t,i)=>(u.push({id:t,name:i&&i.name,type:"chunk"}),e.emitChunk(t,i)),emitFile:e=>(u.push(e),i.emitFile(e)),error:(t,i)=>("string"==typeof t&&(t={message:t}),i&&fe(t,i,m,n),t.id=n,t.hook="transform",e.error(t)),getCombinedSourcemap(){const e=function(e,t,i,s,n){return s.length?{version:3,...Ln(e,t,i,s,Dn(n)).traceMappings()}:i}(n,o,a,r,s);if(!e){return new x(o).generateMap({hires:!0,includeContent:!0,source:n})}return a!==e&&(a=e,r.length=0),new h({...e,file:null,sourcesContent:e.sourcesContent})},setAssetSource(){return this.error({code:"INVALID_SETASSETSOURCE",message:"setAssetSource cannot be called in transform for caching reasons. Use emitFile with a source, or call setAssetSource in another hook."})},warn(t,i){"string"==typeof t&&(t={message:t}),i&&fe(t,i,m,n),t.id=n,t.hook="transform",e.warn(t);}};var l,g;}));}catch(e){Xo(e,f,{hook:"transform",id:n});}return d||u.length&&(t.transformFiles=u),{ast:l,code:g,customTransformCache:d,originalCode:o,originalSourcemap:a,sourcemapChain:r,transformDependencies:c}}class el{constructor(e,t,i,s){this.graph=e,this.modulesById=t,this.options=i,this.pluginDriver=s,this.implicitEntryModules=new Set,this.indexedEntryModules=[],this.latestLoadModulesPromise=Promise.resolve(),this.moduleLoadPromises=new Map,this.modulesWithLoadedDependencies=new Set,this.nextChunkNamePriority=0,this.nextEntryModuleIndex=0,this.resolveId=async(e,t,i,s,n=null)=>this.getResolvedIdWithDefaults(this.getNormalizedResolvedIdWithoutDefaults(!this.options.external(e,t,!1)&&await Ko(e,t,this.options.preserveSymlinks,this.pluginDriver,this.resolveId,n,i,"boolean"==typeof s?s:!t),t,e)),this.hasModuleSideEffects=i.treeshake?i.treeshake.moduleSideEffects:()=>!0;}async addAdditionalModules(e){const t=this.extendLoadModulesPromise(Promise.all(e.map((e=>this.loadEntryModule(e,!1,void 0,null)))));return await this.awaitLoadModulesPromise(),t}async addEntryModules(e,t){const i=this.nextEntryModuleIndex;this.nextEntryModuleIndex+=e.length;const s=this.nextChunkNamePriority;this.nextChunkNamePriority+=e.length;const n=await this.extendLoadModulesPromise(Promise.all(e.map((({id:e,importer:t})=>this.loadEntryModule(e,!0,t,null)))).then((n=>{for(let r=0;r<n.length;r++){const a=n[r];a.isUserDefinedEntryPoint=a.isUserDefinedEntryPoint||t,il(a,e[r],t,s+r);const o=this.indexedEntryModules.find((e=>e.module===a));o?o.index=Math.min(o.index,i+r):this.indexedEntryModules.push({index:i+r,module:a});}return this.indexedEntryModules.sort((({index:e},{index:t})=>e>t?1:-1)),n})));return await this.awaitLoadModulesPromise(),{entryModules:this.indexedEntryModules.map((({module:e})=>e)),implicitEntryModules:[...this.implicitEntryModules],newEntryModules:n}}async emitChunk({fileName:e,id:t,importer:i,name:s,implicitlyLoadedAfterOneOf:n,preserveSignature:r}){const a={fileName:e||null,id:t,importer:i,name:s||null},o=n?await this.addEntryWithImplicitDependants(a,n):(await this.addEntryModules([a],!1)).newEntryModules[0];return null!=r&&(o.preserveSignature=r),o}async preloadModule(e){return (await this.fetchModule(this.getResolvedIdWithDefaults(e),void 0,!1,!e.resolveDependencies||"resolveDependencies")).info}addEntryWithImplicitDependants(e,t){const i=this.nextChunkNamePriority++;return this.extendLoadModulesPromise(this.loadEntryModule(e.id,!1,e.importer,null).then((async s=>{if(il(s,e,!1,i),!s.info.isEntry){this.implicitEntryModules.add(s);const i=await Promise.all(t.map((t=>this.loadEntryModule(t,!1,e.importer,s.id))));for(const e of i)s.implicitlyLoadedAfter.add(e);for(const e of s.implicitlyLoadedAfter)e.implicitlyLoadedBefore.add(s);}return s})))}async addModuleSource(e,t,i){let s;en("load modules",3);try{s=await this.graph.fileOperationQueue.run((async()=>{var t;return null!==(t=await this.pluginDriver.hookFirst("load",[e]))&&void 0!==t?t:await qo.readFile(e,"utf8")}));}catch(i){tn("load modules",3);let s=`Could not load ${e}`;throw t&&(s+=` (imported by ${he(t)})`),s+=`: ${i.message}`,i.message=s,i}tn("load modules",3);const n="string"==typeof s?{code:s}:null!=s&&"object"==typeof s&&"string"==typeof s.code?s:pe(function(e){return {code:me.BAD_LOADER,message:`Error loading ${he(e)}: plugin load hook should return a string, a { code, map } object, or nothing/null`}}(e)),r=this.graph.cachedModules.get(e);if(!r||r.customTransformCache||r.originalCode!==n.code||await this.pluginDriver.hookFirst("shouldTransformCachedModule",[{ast:r.ast,code:r.code,id:r.id,meta:r.meta,moduleSideEffects:r.moduleSideEffects,resolvedSources:r.resolvedIds,syntheticNamedExports:r.syntheticNamedExports}]))i.updateOptions(n),i.setSource(await Jo(n,i,this.pluginDriver,this.options.onwarn));else {if(r.transformFiles)for(const e of r.transformFiles)this.pluginDriver.emitFile(e);i.setSource(r);}}async awaitLoadModulesPromise(){let e;do{e=this.latestLoadModulesPromise,await e;}while(e!==this.latestLoadModulesPromise)}extendLoadModulesPromise(e){return this.latestLoadModulesPromise=Promise.all([e,this.latestLoadModulesPromise]),this.latestLoadModulesPromise.catch((()=>{})),e}async fetchDynamicDependencies(e,t){const i=await Promise.all(t.map((t=>t.then((async([t,i])=>null===i?null:"string"==typeof i?(t.resolution=i,null):t.resolution=await this.fetchResolvedDependency(he(i.id),e.id,i))))));for(const t of i)t&&(e.dynamicDependencies.add(t),t.dynamicImporters.push(e.id));}async fetchModule({id:e,meta:t,moduleSideEffects:i,syntheticNamedExports:s},n,r,a){const o=this.modulesById.get(e);if(o instanceof ln)return await this.handleExistingModule(o,r,a),o;const l=new ln(this.graph,e,this.options,r,i,s,t);this.modulesById.set(e,l),this.graph.watchFiles[e]=!0;const h=this.addModuleSource(e,n,l).then((()=>[this.getResolveStaticDependencyPromises(l),this.getResolveDynamicImportPromises(l),c])),c=nl(h).then((()=>this.pluginDriver.hookParallel("moduleParsed",[l.info])));c.catch((()=>{})),this.moduleLoadPromises.set(l,h);const u=await h;return a?"resolveDependencies"===a&&await c:await this.fetchModuleDependencies(l,...u),l}async fetchModuleDependencies(e,t,i,s){this.modulesWithLoadedDependencies.has(e)||(this.modulesWithLoadedDependencies.add(e),await Promise.all([this.fetchStaticDependencies(e,t),this.fetchDynamicDependencies(e,i)]),e.linkImports(),await s);}fetchResolvedDependency(e,t,i){if(i.external){const{external:s,id:n,moduleSideEffects:r,meta:a}=i;this.modulesById.has(n)||this.modulesById.set(n,new $e(this.options,n,r,a,"absolute"!==s&&P(n)));const o=this.modulesById.get(n);return o instanceof $e?Promise.resolve(o):pe(function(e,t){return {code:me.INVALID_EXTERNAL_ID,message:`'${e}' is imported as an external by ${he(t)}, but is already an existing non-external module id.`}}(e,t))}return this.fetchModule(i,t,!1,!1)}async fetchStaticDependencies(e,t){for(const i of await Promise.all(t.map((t=>t.then((([t,i])=>this.fetchResolvedDependency(t,e.id,i)))))))e.dependencies.add(i),i.importers.push(e.id);if(!this.options.treeshake||"no-treeshake"===e.info.moduleSideEffects)for(const t of e.dependencies)t instanceof ln&&(t.importedFromNotTreeshaken=!0);}getNormalizedResolvedIdWithoutDefaults(e,t,i){const{makeAbsoluteExternalsRelative:s}=this.options;if(e){if("object"==typeof e){const n=e.external||this.options.external(e.id,t,!0);return {...e,external:n&&("relative"===n||!P(e.id)||!0===n&&sl(e.id,i,s)||"absolute")}}const n=this.options.external(e,t,!0);return {external:n&&(sl(e,i,s)||"absolute"),id:n&&s?tl(e,t):e}}const n=s?tl(i,t):i;return !1===e||this.options.external(n,t,!0)?{external:sl(n,i,s)||"absolute",id:n}:null}getResolveDynamicImportPromises(e){return e.dynamicImports.map((async t=>{const i=await this.resolveDynamicImport(e,"string"==typeof t.argument?t.argument:t.argument.esTreeNode,e.id);return i&&"object"==typeof i&&(t.id=i.id),[t,i]}))}getResolveStaticDependencyPromises(e){return Array.from(e.sources,(async t=>[t,e.resolvedIds[t]=e.resolvedIds[t]||this.handleResolveId(await this.resolveId(t,e.id,se,!1),t,e.id)]))}getResolvedIdWithDefaults(e){var t,i;if(!e)return null;const s=e.external||!1;return {external:s,id:e.id,meta:e.meta||{},moduleSideEffects:null!==(t=e.moduleSideEffects)&&void 0!==t?t:this.hasModuleSideEffects(e.id,!!s),syntheticNamedExports:null!==(i=e.syntheticNamedExports)&&void 0!==i&&i}}async handleExistingModule(e,t,i){const s=this.moduleLoadPromises.get(e);if(i)return "resolveDependencies"===i?nl(s):s;if(t){e.info.isEntry=!0,this.implicitEntryModules.delete(e);for(const t of e.implicitlyLoadedAfter)t.implicitlyLoadedBefore.delete(e);e.implicitlyLoadedAfter.clear();}return this.fetchModuleDependencies(e,...await s)}handleResolveId(e,t,i){return null===e?w(t)?pe(function(e,t){return {code:me.UNRESOLVED_IMPORT,message:`Could not resolve '${e}' from ${he(t)}`}}(t,i)):(this.options.onwarn(function(e,t){return {code:me.UNRESOLVED_IMPORT,importer:he(t),message:`'${e}' is imported by ${he(t)}, but could not be resolved – treating it as an external dependency`,source:e,url:"https://rollupjs.org/guide/en/#warning-treating-module-as-external-dependency"}}(t,i)),{external:!0,id:t,meta:{},moduleSideEffects:this.hasModuleSideEffects(t,!0),syntheticNamedExports:!1}):(e.external&&e.syntheticNamedExports&&this.options.onwarn(function(e,t){return {code:me.EXTERNAL_SYNTHETIC_EXPORTS,importer:he(t),message:`External '${e}' can not have 'syntheticNamedExports' enabled.`,source:e}}(t,i)),e)}async loadEntryModule(e,t,i,s){const n=await Ko(e,i,this.options.preserveSymlinks,this.pluginDriver,this.resolveId,null,se,!0);return null==n?pe(null===s?function(e){return {code:me.UNRESOLVED_ENTRY,message:`Could not resolve entry module (${he(e)}).`}}(e):function(e,t){return {code:me.MISSING_IMPLICIT_DEPENDANT,message:`Module "${he(e)}" that should be implicitly loaded before "${he(t)}" could not be resolved.`}}(e,s)):!1===n||"object"==typeof n&&n.external?pe(null===s?function(e){return {code:me.UNRESOLVED_ENTRY,message:`Entry module cannot be external (${he(e)}).`}}(e):function(e,t){return {code:me.MISSING_IMPLICIT_DEPENDANT,message:`Module "${he(e)}" that should be implicitly loaded before "${he(t)}" cannot be external.`}}(e,s)):this.fetchModule(this.getResolvedIdWithDefaults("object"==typeof n?n:{id:n}),void 0,t,!1)}async resolveDynamicImport(e,t,i){var s,n;const r=await this.pluginDriver.hookFirst("resolveDynamicImport",[t,i]);return "string"!=typeof t?"string"==typeof r?r:r?{external:!1,moduleSideEffects:!0,...r}:null:null==r?null!==(s=(n=e.resolvedIds)[t])&&void 0!==s?s:n[t]=this.handleResolveId(await this.resolveId(t,e.id,se,!1),t,e.id):this.handleResolveId(this.getResolvedIdWithDefaults(this.getNormalizedResolvedIdWithoutDefaults(r,i,t)),t,i)}}function tl(e,t){return w(e)?t?O(t,"..",e):O(e):e}function il(e,{fileName:t,name:i},s,n){var r;if(null!==t)e.chunkFileNames.add(t);else if(null!==i){let t=0;for(;(null===(r=e.chunkNames[t])||void 0===r?void 0:r.priority)<n;)t++;e.chunkNames.splice(t,0,{isUserDefined:s,name:i,priority:n});}}function sl(e,t,i){return !0===i||"ifRelativeSource"===i&&w(t)||!P(e)}async function nl(e){const[t,i]=await e;return Promise.all([...t,...i])}class rl extends Bt{constructor(){super(),this.parent=null,this.variables.set("undefined",new Rs);}findVariable(e){let t=this.variables.get(e);return t||(t=new ii(e),this.variables.set(e,t)),t}}function al(e,t,i,s,n,r){let a=!1;return (...o)=>(a||(a=!0,ke({message:`The "this.${t}" plugin context function used by plugin ${s} is deprecated. The "this.${i}" plugin context function should be used instead.`,plugin:s},n,r)),e(...o))}function ol(e,t,i,s,n,r){let a,o=!0;if("string"!=typeof e.cacheKey&&(e.name.startsWith("at position ")||e.name.startsWith("at output position ")||r.has(e.name)?o=!1:r.add(e.name)),t)if(o){const i=e.cacheKey||e.name;h=t[i]||(t[i]=Object.create(null)),a={delete:e=>delete h[e],get(e){const t=h[e];if(t)return t[0]=0,t[1]},has(e){const t=h[e];return !!t&&(t[0]=0,!0)},set(e,t){h[e]=[0,t];}};}else l=e.name,a={delete:()=>Zo(l),get:()=>Zo(l),has:()=>Zo(l),set:()=>Zo(l)};else a=Qo;var l,h;const c={addWatchFile(e){if(i.phase>=Gs.GENERATE)return this.error({code:me.INVALID_ROLLUP_PHASE,message:"Cannot call addWatchFile after the build has finished."});i.watchFiles[e]=!0;},cache:a,emitAsset:al(((e,t)=>n.emitFile({name:e,source:t,type:"asset"})),"emitAsset","emitFile",e.name,!0,s),emitChunk:al(((e,t)=>n.emitFile({id:e,name:t&&t.name,type:"chunk"})),"emitChunk","emitFile",e.name,!0,s),emitFile:n.emitFile.bind(n),error:t=>Xo(t,e.name),getAssetFileName:al(n.getFileName,"getAssetFileName","getFileName",e.name,!0,s),getChunkFileName:al(n.getFileName,"getChunkFileName","getFileName",e.name,!0,s),getFileName:n.getFileName,getModuleIds:()=>i.modulesById.keys(),getModuleInfo:i.getModuleInfo,getWatchFiles:()=>Object.keys(i.watchFiles),isExternal:al(((e,t,i=!1)=>s.external(e,t,i)),"isExternal","resolve",e.name,!0,s),load:e=>i.moduleLoader.preloadModule(e),meta:{rollupVersion:"2.77.0",watchMode:i.watchMode},get moduleIds(){const t=i.modulesById.keys();return function*(){ke({message:`Accessing "this.moduleIds" on the plugin context by plugin ${e.name} is deprecated. The "this.getModuleIds" plugin context function should be used instead.`,plugin:e.name},!1,s),yield*t;}()},parse:i.contextParse.bind(i),resolve:(t,s,{custom:n,isEntry:r,skipSelf:a}=ie)=>i.moduleLoader.resolveId(t,s,n,r,a?[{importer:s,plugin:e,source:t}]:null),resolveId:al(((e,t)=>i.moduleLoader.resolveId(e,t,ie,void 0).then((e=>e&&e.id))),"resolveId","resolve",e.name,!0,s),setAssetSource:n.setAssetSource,warn(t){"string"==typeof t&&(t={message:t}),t.code&&(t.pluginCode=t.code),t.code="PLUGIN_WARNING",t.plugin=e.name,s.onwarn(t);}};return c}const ll=Object.keys({buildEnd:1,buildStart:1,closeBundle:1,closeWatcher:1,load:1,moduleParsed:1,options:1,resolveDynamicImport:1,resolveId:1,shouldTransformCachedModule:1,transform:1,watchChange:1});function hl(e,t){return pe({code:"INVALID_PLUGIN_HOOK",message:`Error running plugin hook ${e} for ${t}, expected a function hook.`})}class cl{constructor(e,t,i,s,n){this.graph=e,this.options=t,this.unfulfilledActions=new Set,function(e,t){for(const{active:i,deprecated:s,replacement:n}of Yo)for(const r of e)s in r&&ke({message:`The "${s}" hook used by plugin ${r.name} is deprecated. The "${n}" hook should be used instead.`,plugin:r.name},i,t);}(i,t),this.pluginCache=s,this.fileEmitter=new Wr(e,t,n&&n.fileEmitter),this.emitFile=this.fileEmitter.emitFile.bind(this.fileEmitter),this.getFileName=this.fileEmitter.getFileName.bind(this.fileEmitter),this.finaliseAssets=this.fileEmitter.assertAssetsFinalized.bind(this.fileEmitter),this.setOutputBundle=this.fileEmitter.setOutputBundle.bind(this.fileEmitter),this.plugins=i.concat(n?n.plugins:[]);const r=new Set;if(this.pluginContexts=new Map(this.plugins.map((i=>[i,ol(i,s,e,t,this.fileEmitter,r)]))),n)for(const e of i)for(const i of ll)i in e&&t.onwarn((a=e.name,o=i,{code:me.INPUT_HOOK_IN_OUTPUT_PLUGIN,message:`The "${o}" hook used by the output plugin ${a} is a build time hook and will not be run for that plugin. Either this plugin cannot be used as an output plugin, or it should have an option to configure it as an output plugin.`}));var a,o;}createOutputPluginDriver(e){return new cl(this.graph,this.options,e,this.pluginCache,this)}getUnfulfilledHookActions(){return this.unfulfilledActions}hookFirst(e,t,i,s){let n=Promise.resolve(void 0);for(const r of this.plugins)s&&s.has(r)||(n=n.then((s=>null!=s?s:this.runHook(e,t,r,!1,i))));return n}hookFirstSync(e,t,i){for(const s of this.plugins){const n=this.runHookSync(e,t,s,i);if(null!=n)return n}return null}hookParallel(e,t,i){const s=[];for(const n of this.plugins){const r=this.runHook(e,t,n,!1,i);r&&s.push(r);}return Promise.all(s).then((()=>{}))}hookReduceArg0(e,[t,...i],s,n){let r=Promise.resolve(t);for(const t of this.plugins)r=r.then((r=>{const a=[r,...i],o=this.runHook(e,a,t,!1,n);return o?o.then((e=>s.call(this.pluginContexts.get(t),r,e,t))):r}));return r}hookReduceArg0Sync(e,[t,...i],s,n){for(const r of this.plugins){const a=[t,...i],o=this.runHookSync(e,a,r,n);t=s.call(this.pluginContexts.get(r),t,o,r);}return t}hookReduceValue(e,t,i,s,n){let r=Promise.resolve(t);for(const t of this.plugins)r=r.then((r=>{const a=this.runHook(e,i,t,!0,n);return a?a.then((e=>s.call(this.pluginContexts.get(t),r,e,t))):r}));return r}hookReduceValueSync(e,t,i,s,n){let r=t;for(const t of this.plugins){const a=this.runHookSync(e,i,t,n);r=s.call(this.pluginContexts.get(t),r,a,t);}return r}hookSeq(e,t,i){let s=Promise.resolve();for(const n of this.plugins)s=s.then((()=>this.runHook(e,t,n,!1,i)));return s}runHook(e,t,i,s,n){const r=i[e];if(!r)return;let a=this.pluginContexts.get(i);n&&(a=n(a,i));let o=null;return Promise.resolve().then((()=>{if("function"!=typeof r)return s?r:hl(e,i.name);const n=r.apply(a,t);return n&&n.then?(o=[i.name,e,t],this.unfulfilledActions.add(o),Promise.resolve(n).then((e=>(this.unfulfilledActions.delete(o),e)))):n})).catch((t=>(null!==o&&this.unfulfilledActions.delete(o),Xo(t,i.name,{hook:e}))))}runHookSync(e,t,i,s){const n=i[e];if(!n)return;let r=this.pluginContexts.get(i);s&&(r=s(r,i));try{return "function"!=typeof n?hl(e,i.name):n.apply(r,t)}catch(t){return Xo(t,i.name,{hook:e})}}}class ul{constructor(e){this.maxParallel=e,this.queue=[],this.workerCount=0;}run(e){return new Promise(((t,i)=>{this.queue.push({reject:i,resolve:t,task:e}),this.work();}))}async work(){if(this.workerCount>=this.maxParallel)return;let e;for(this.workerCount++;e=this.queue.shift();){const{reject:t,resolve:i,task:s}=e;try{i(await s());}catch(e){t(e);}}this.workerCount--;}}class dl{constructor(e,t){var i,s;if(this.options=e,this.cachedModules=new Map,this.deoptimizationTracker=new U,this.entryModules=[],this.modulesById=new Map,this.needsTreeshakingPass=!1,this.phase=Gs.LOAD_AND_PARSE,this.scope=new rl,this.watchFiles=Object.create(null),this.watchMode=!1,this.externalModules=[],this.implicitEntryModules=[],this.modules=[],this.getModuleInfo=e=>{const t=this.modulesById.get(e);return t?t.info:null},!1!==e.cache){if(null===(i=e.cache)||void 0===i?void 0:i.modules)for(const t of e.cache.modules)this.cachedModules.set(t.id,t);this.pluginCache=(null===(s=e.cache)||void 0===s?void 0:s.plugins)||Object.create(null);for(const e in this.pluginCache){const t=this.pluginCache[e];for(const e of Object.values(t))e[0]++;}}if(t){this.watchMode=!0;const e=(...e)=>this.pluginDriver.hookParallel("watchChange",e),i=()=>this.pluginDriver.hookParallel("closeWatcher",[]);t.onCurrentAwaited("change",e),t.onCurrentAwaited("close",i);}this.pluginDriver=new cl(this,e,e.plugins,this.pluginCache),this.acornParser=Ha.extend(...e.acornInjectPlugins),this.moduleLoader=new el(this,this.modulesById,this.options,this.pluginDriver),this.fileOperationQueue=new ul(e.maxParallelFileOps);}async build(){en("generate module graph",2),await this.generateModuleGraph(),tn("generate module graph",2),en("sort modules",2),this.phase=Gs.ANALYSE,this.sortModules(),tn("sort modules",2),en("mark included statements",2),this.includeStatements(),tn("mark included statements",2),this.phase=Gs.GENERATE;}contextParse(e,t={}){const i=t.onComment,s=[];t.onComment=i&&"function"==typeof i?(e,n,r,a,...o)=>(s.push({end:a,start:r,type:e?"Block":"Line",value:n}),i.call(t,e,n,r,a,...o)):s;const n=this.acornParser.parse(e,{...this.options.acorn,...t});return "object"==typeof i&&i.push(...s),t.onComment=i,function(e,t,i){const s=[],n=[];for(const t of e)lt.test(t.value)?s.push(t):it.test(t.value)&&n.push(t);for(const e of n)ht(t,e,!1);st(t,{annotationIndex:0,annotations:s,code:i});}(s,n,e),n}getCache(){for(const e in this.pluginCache){const t=this.pluginCache[e];let i=!0;for(const[e,s]of Object.entries(t))s[0]>=this.options.experimentalCacheExpiry?delete t[e]:i=!1;i&&delete this.pluginCache[e];}return {modules:this.modules.map((e=>e.toJSON())),plugins:this.pluginCache}}async generateModuleGraph(){var e;if(({entryModules:this.entryModules,implicitEntryModules:this.implicitEntryModules}=await this.moduleLoader.addEntryModules((e=this.options.input,Array.isArray(e)?e.map((e=>({fileName:null,id:e,implicitlyLoadedAfter:[],importer:void 0,name:null}))):Object.entries(e).map((([e,t])=>({fileName:null,id:t,implicitlyLoadedAfter:[],importer:void 0,name:e})))),!0)),0===this.entryModules.length)throw new Error("You must supply options.input to rollup");for(const e of this.modulesById.values())e instanceof ln?this.modules.push(e):this.externalModules.push(e);}includeStatements(){for(const e of [...this.entryModules,...this.implicitEntryModules])rn(e);if(this.options.treeshake){let e=1;do{en(`treeshaking pass ${e}`,3),this.needsTreeshakingPass=!1;for(const e of this.modules)e.isExecuted&&("no-treeshake"===e.info.moduleSideEffects?e.includeAllInBundle():e.include());if(1===e)for(const e of [...this.entryModules,...this.implicitEntryModules])!1!==e.preserveSignature&&(e.includeAllExports(!1),this.needsTreeshakingPass=!0);tn("treeshaking pass "+e++,3);}while(this.needsTreeshakingPass)}else for(const e of this.modules)e.includeAllInBundle();for(const e of this.externalModules)e.warnUnusedImports();for(const e of this.implicitEntryModules)for(const t of e.implicitlyLoadedAfter)t.info.isEntry||t.isIncluded()||pe(be(t));}sortModules(){const{orderedModules:e,cyclePaths:t}=function(e){let t=0;const i=[],s=new Set,n=new Set,r=new Map,a=[],o=e=>{if(e instanceof ln){for(const t of e.dependencies)r.has(t)?s.has(t)||i.push(Jr(t,e,r)):(r.set(t,e),o(t));for(const t of e.implicitlyLoadedBefore)n.add(t);for(const{resolution:t}of e.dynamicImports)t instanceof ln&&n.add(t);a.push(e);}e.execIndex=t++,s.add(e);};for(const t of e)r.has(t)||(r.set(t,null),o(t));for(const e of n)r.has(e)||(r.set(e,null),o(e));return {cyclePaths:i,orderedModules:a}}(this.entryModules);for(const e of t)this.options.onwarn({code:"CIRCULAR_DEPENDENCY",cycle:e,importer:e[0],message:`Circular dependency: ${e.join(" -> ")}`});this.modules=e;for(const e of this.modules)e.bindReferences();this.warnForMissingExports();}warnForMissingExports(){for(const e of this.modules)for(const t of e.importDescriptions.values())"*"===t.name||t.module.getVariableForExportName(t.name)[0]||e.warn({code:"NON_EXISTENT_EXPORT",message:`Non-existent export '${t.name}' is imported from ${he(t.module.id)}`,name:t.name,source:t.module.id},t.start);}}function pl(e){return Array.isArray(e)?e.filter(Boolean):e?[e]:[]}function fl(e,t){return t()}const ml=e=>console.warn(e.message||e);function gl(e,t,i,s,n=/$./){const r=new Set(t),a=Object.keys(e).filter((e=>!(r.has(e)||n.test(e))));a.length>0&&s({code:"UNKNOWN_OPTION",message:`Unknown ${i}: ${a.join(", ")}. Allowed options: ${[...r].sort().join(", ")}`});}const yl={recommended:{annotations:!0,correctVarValueBeforeDeclaration:!1,moduleSideEffects:()=>!0,propertyReadSideEffects:!0,tryCatchDeoptimization:!0,unknownGlobalSideEffects:!1},safest:{annotations:!0,correctVarValueBeforeDeclaration:!0,moduleSideEffects:()=>!0,propertyReadSideEffects:!0,tryCatchDeoptimization:!0,unknownGlobalSideEffects:!0},smallest:{annotations:!0,correctVarValueBeforeDeclaration:!1,moduleSideEffects:()=>!1,propertyReadSideEffects:!1,tryCatchDeoptimization:!1,unknownGlobalSideEffects:!1}},xl={es2015:{arrowFunctions:!0,constBindings:!0,objectShorthand:!0,reservedNamesAsProps:!0,symbols:!0},es5:{arrowFunctions:!1,constBindings:!1,objectShorthand:!1,reservedNamesAsProps:!0,symbols:!1}},El=(e,t,i,s)=>{const n=null==e?void 0:e.preset;if(n){const s=t[n];if(s)return {...s,...e};pe(xe(`${i}.preset`,bl(i),`valid values are ${oe(Object.keys(t))}`,n));}return ((e,t,i)=>s=>{if("string"==typeof s){const n=e[s];if(n)return n;pe(xe(t,bl(t),`valid values are ${i}${oe(Object.keys(e))}. You can also supply an object for more fine-grained control`,s));}return (e=>e&&"object"==typeof e?e:{})(s)})(t,i,s)(e)},bl=e=>e.split(".").join("").toLowerCase();const vl=e=>{const{onwarn:t}=e;return t?e=>{e.toString=()=>{let t="";return e.plugin&&(t+=`(${e.plugin} plugin) `),e.loc&&(t+=`${he(e.loc.file)} (${e.loc.line}:${e.loc.column}) `),t+=e.message,t},t(e,ml);}:ml},Sl=e=>({allowAwaitOutsideFunction:!0,ecmaVersion:"latest",preserveParens:!1,sourceType:"module",...e.acorn}),Al=e=>pl(e.acornInjectPlugins),Il=e=>{var t;return (null===(t=e.cache)||void 0===t?void 0:t.cache)||e.cache},kl=e=>{if(!0===e)return ()=>!0;if("function"==typeof e)return (t,...i)=>!t.startsWith("\0")&&e(t,...i)||!1;if(e){const t=new Set,i=[];for(const s of pl(e))s instanceof RegExp?i.push(s):t.add(s);return (e,...s)=>t.has(e)||i.some((t=>t.test(e)))}return ()=>!1},Pl=(e,t,i)=>{const s=e.inlineDynamicImports;return s&&Pe('The "inlineDynamicImports" option is deprecated. Use the "output.inlineDynamicImports" option instead.',!1,t,i),s},wl=e=>{const t=e.input;return null==t?[]:"string"==typeof t?[t]:t},Cl=(e,t,i)=>{const s=e.manualChunks;return s&&Pe('The "manualChunks" option is deprecated. Use the "output.manualChunks" option instead.',!1,t,i),s},_l=(e,t,i)=>{var s;const n=e.maxParallelFileReads;"number"==typeof n&&Pe('The "maxParallelFileReads" option is deprecated. Use the "maxParallelFileOps" option instead.',!1,t,i);const r=null!==(s=e.maxParallelFileOps)&&void 0!==s?s:n;return "number"==typeof r?r<=0?1/0:r:20},Nl=(e,t)=>{const i=e.moduleContext;if("function"==typeof i)return e=>{var s;return null!==(s=i(e))&&void 0!==s?s:t};if(i){const e=Object.create(null);for(const[t,s]of Object.entries(i))e[O(t)]=s;return i=>e[i]||t}return ()=>t},$l=(e,t)=>{const i=e.preserveEntrySignatures;return null==i&&t.add("preserveEntrySignatures"),null!=i?i:"strict"},Tl=(e,t,i)=>{const s=e.preserveModules;return s&&Pe('The "preserveModules" option is deprecated. Use the "output.preserveModules" option instead.',!1,t,i),s},Ol=(e,t,i)=>{const s=e.treeshake;if(!1===s)return !1;const n=El(e.treeshake,yl,"treeshake","false, true, ");return void 0!==n.pureExternalModules&&Pe('The "treeshake.pureExternalModules" option is deprecated. The "treeshake.moduleSideEffects" option should be used instead. "treeshake.pureExternalModules: true" is equivalent to "treeshake.moduleSideEffects: \'no-external\'"',!0,t,i),{annotations:!1!==n.annotations,correctVarValueBeforeDeclaration:!0===n.correctVarValueBeforeDeclaration,moduleSideEffects:"object"==typeof s&&s.pureExternalModules?Rl(s.moduleSideEffects,s.pureExternalModules):Rl(n.moduleSideEffects,void 0),propertyReadSideEffects:"always"===n.propertyReadSideEffects?"always":!1!==n.propertyReadSideEffects,tryCatchDeoptimization:!1!==n.tryCatchDeoptimization,unknownGlobalSideEffects:!1!==n.unknownGlobalSideEffects}},Rl=(e,t)=>{if("boolean"==typeof e)return ()=>e;if("no-external"===e)return (e,t)=>!t;if("function"==typeof e)return (t,i)=>!!t.startsWith("\0")||!1!==e(t,i);if(Array.isArray(e)){const t=new Set(e);return e=>t.has(e)}e&&pe(xe("treeshake.moduleSideEffects","treeshake",'please use one of false, "no-external", a function or an array'));const i=kl(t);return (e,t)=>!(t&&i(e))},Ml=/[\x00-\x1F\x7F<>*#"{}|^[\]`;?:&=+$,]/g,Dl=/^[a-z]:/i;function Ll(e){const t=Dl.exec(e),i=t?t[0]:"";return i+e.substr(i.length).replace(Ml,"_")}const Vl=(e,t,i)=>{const{file:s}=e;if("string"==typeof s){if(t)return pe(xe("output.file","outputdir",'you must set "output.dir" instead of "output.file" when using the "output.preserveModules" option'));if(!Array.isArray(i.input))return pe(xe("output.file","outputdir",'you must set "output.dir" instead of "output.file" when providing named inputs'))}return s},Bl=e=>{const t=e.format;switch(t){case void 0:case"es":case"esm":case"module":return "es";case"cjs":case"commonjs":return "cjs";case"system":case"systemjs":return "system";case"amd":case"iife":case"umd":return t;default:return pe({message:'You must specify "output.format", which can be one of "amd", "cjs", "system", "es", "iife" or "umd".',url:"https://rollupjs.org/guide/en/#outputformat"})}},Fl=(e,t)=>{var i;const s=(null!==(i=e.inlineDynamicImports)&&void 0!==i?i:t.inlineDynamicImports)||!1,{input:n}=t;return s&&(Array.isArray(n)?n:Object.keys(n)).length>1?pe(xe("output.inlineDynamicImports","outputinlinedynamicimports",'multiple inputs are not supported when "output.inlineDynamicImports" is true')):s},zl=(e,t,i)=>{var s;const n=(null!==(s=e.preserveModules)&&void 0!==s?s:i.preserveModules)||!1;if(n){if(t)return pe(xe("output.inlineDynamicImports","outputinlinedynamicimports",'this option is not supported for "output.preserveModules"'));if(!1===i.preserveEntrySignatures)return pe(xe("preserveEntrySignatures","preserveentrysignatures",'setting this option to false is not supported for "output.preserveModules"'))}return n},jl=(e,t)=>{const i=e.preferConst;return null!=i&&ke('The "output.preferConst" option is deprecated. Use the "output.generatedCode.constBindings" option instead.',!1,t),!!i},Ul=e=>{const{preserveModulesRoot:t}=e;if(null!=t)return O(t)},Gl=e=>{const t={autoId:!1,basePath:"",define:"define",...e.amd};if((t.autoId||t.basePath)&&t.id)return pe(xe("output.amd.id","outputamd",'this option cannot be used together with "output.amd.autoId"/"output.amd.basePath"'));if(t.basePath&&!t.autoId)return pe(xe("output.amd.basePath","outputamd",'this option only works with "output.amd.autoId"'));let i;return i=t.autoId?{autoId:!0,basePath:t.basePath,define:t.define}:{autoId:!1,define:t.define,id:t.id},i},Hl=(e,t)=>{const i=e[t];return "function"==typeof i?i:()=>i||""},Wl=(e,t)=>{const{dir:i}=e;return "string"==typeof i&&"string"==typeof t?pe(xe("output.dir","outputdir",'you must set either "output.file" for a single-file build or "output.dir" when generating multiple chunks')):i},ql=(e,t)=>{const i=e.dynamicImportFunction;return i&&ke('The "output.dynamicImportFunction" option is deprecated. Use the "renderDynamicImport" plugin hook instead.',!1,t),i},Kl=(e,t)=>{const i=e.entryFileNames;return null==i&&t.add("entryFileNames"),null!=i?i:"[name].js"};function Xl(e,t){const i=e.exports;if(null==i)t.add("exports");else if(!["default","named","none","auto"].includes(i))return pe((s=i,{code:me.INVALID_EXPORT_OPTION,message:`"output.exports" must be "default", "named", "none", "auto", or left unspecified (defaults to "auto"), received "${s}"`,url:"https://rollupjs.org/guide/en/#outputexports"}));var s;return i||"auto"}const Yl=(e,t)=>{const i=El(e.generatedCode,xl,"output.generatedCode","");return {arrowFunctions:!0===i.arrowFunctions,constBindings:!0===i.constBindings||t,objectShorthand:!0===i.objectShorthand,reservedNamesAsProps:!0===i.reservedNamesAsProps,symbols:!0===i.symbols}},Ql=(e,t)=>{if(t)return "";const i=e.indent;return !1===i?"":null==i||i},Zl=new Set(["auto","esModule","default","defaultOnly",!0,!1]),Jl=(e,t)=>{const i=e.interop,s=new Set,n=e=>{if(!s.has(e)){if(s.add(e),!Zl.has(e))return pe(xe("output.interop","outputinterop",`use one of ${Array.from(Zl,(e=>JSON.stringify(e))).join(", ")}`,e));"boolean"==typeof e&&ke({message:`The boolean value "${e}" for the "output.interop" option is deprecated. Use ${e?'"auto"':'"esModule", "default" or "defaultOnly"'} instead.`,url:"https://rollupjs.org/guide/en/#outputinterop"},!1,t);}return e};if("function"==typeof i){const e=Object.create(null);let t=null;return s=>null===s?t||n(t=i(s)):s in e?e[s]:n(e[s]=i(s))}return void 0===i?()=>!0:()=>n(i)},eh=(e,t,i,s)=>{const n=e.manualChunks||s.manualChunks;if(n){if(t)return pe(xe("output.manualChunks","outputmanualchunks",'this option is not supported for "output.inlineDynamicImports"'));if(i)return pe(xe("output.manualChunks","outputmanualchunks",'this option is not supported for "output.preserveModules"'))}return n||{}},th=(e,t,i)=>{var s;return null!==(s=e.minifyInternalExports)&&void 0!==s?s:i||"es"===t||"system"===t},ih=(e,t,i)=>{const s=e.namespaceToStringTag;return null!=s?(ke('The "output.namespaceToStringTag" option is deprecated. Use the "output.generatedCode.symbols" option instead.',!1,i),s):t.symbols||!1},sh=e=>{const{sourcemapBaseUrl:t}=e;if(t)return function(e){try{new URL(e);}catch(e){return !1}return !0}(t)?t:pe(xe("output.sourcemapBaseUrl","outputsourcemapbaseurl",`must be a valid URL, received ${JSON.stringify(t)}`))};function nh(e){return async function(e,t){const{options:i,unsetOptions:s}=await async function(e,t){if(!e)throw new Error("You must supply an options object to rollup");const i=pl(e.plugins),{options:s,unsetOptions:n}=function(e){var t,i,s;const n=new Set,r=null!==(t=e.context)&&void 0!==t?t:"undefined",a=vl(e),o=e.strictDeprecations||!1,l=_l(e,a,o),h={acorn:Sl(e),acornInjectPlugins:Al(e),cache:Il(e),context:r,experimentalCacheExpiry:null!==(i=e.experimentalCacheExpiry)&&void 0!==i?i:10,external:kl(e.external),inlineDynamicImports:Pl(e,a,o),input:wl(e),makeAbsoluteExternalsRelative:null===(s=e.makeAbsoluteExternalsRelative)||void 0===s||s,manualChunks:Cl(e,a,o),maxParallelFileOps:l,maxParallelFileReads:l,moduleContext:Nl(e,r),onwarn:a,perf:e.perf||!1,plugins:pl(e.plugins),preserveEntrySignatures:$l(e,n),preserveModules:Tl(e,a,o),preserveSymlinks:e.preserveSymlinks||!1,shimMissingExports:e.shimMissingExports||!1,strictDeprecations:o,treeshake:Ol(e,a,o)};return gl(e,[...Object.keys(h),"watch"],"input options",h.onwarn,/^(output)$/),{options:h,unsetOptions:n}}(await i.reduce(function(e){return async(t,i)=>i.options&&await i.options.call({meta:{rollupVersion:"2.77.0",watchMode:e}},await t)||t}(t),Promise.resolve(e)));return rh(s.plugins,"at position "),{options:s,unsetOptions:n}}(e,null!==t);!function(e){e.perf?(Xs=new Map,en=Qs,tn=Zs,e.plugins=e.plugins.map(nn)):(en=Ks,tn=Ks);}(i);const n=new dl(i,t),r=!1!==e.cache;delete i.cache,delete e.cache,en("BUILD",1),await fl(n.pluginDriver,(async()=>{try{await n.pluginDriver.hookParallel("buildStart",[i]),await n.build();}catch(e){const t=Object.keys(n.watchFiles);throw t.length>0&&(e.watchFiles=t),await n.pluginDriver.hookParallel("buildEnd",[e]),await n.pluginDriver.hookParallel("closeBundle",[]),e}await n.pluginDriver.hookParallel("buildEnd",[]);})),tn("BUILD",1);const a={cache:r?n.getCache():void 0,async close(){a.closed||(a.closed=!0,await n.pluginDriver.hookParallel("closeBundle",[]));},closed:!1,generate:async e=>a.closed?pe(Ie()):ah(!1,i,s,e,n),watchFiles:Object.keys(n.watchFiles),write:async e=>a.closed?pe(Ie()):ah(!0,i,s,e,n)};i.perf&&(a.getTimings=Js);return a}(e,null)}function rh(e,t){e.forEach(((e,i)=>{e.name||(e.name=`${t}${i+1}`);}));}function ah(e,t,i,s,n){const{options:r,outputPluginDriver:a,unsetOptions:o}=function(e,t,i,s){if(!e)throw new Error("You must supply an options object");const n=pl(e.plugins);rh(n,"at output position ");const r=t.createOutputPluginDriver(n);return {...oh(i,s,e,r),outputPluginDriver:r}}(s,n.pluginDriver,t,i);return fl(0,(async()=>{const i=new ia(r,o,t,a,n),s=await i.generate(e);if(e){if(!r.dir&&!r.file)return pe({code:"MISSING_OPTION",message:'You must specify "output.file" or "output.dir" for the build.'});await Promise.all(Object.values(s).map((e=>n.fileOperationQueue.run((()=>async function(e,t){const i=O(t.dir||N(t.file),e.fileName);let s,n;if(await qo.mkdir(N(i),{recursive:!0}),"asset"===e.type)n=e.source;else if(n=e.code,t.sourcemap&&e.map){let r;if("inline"===t.sourcemap)r=e.map.toUrl();else {const{sourcemapBaseUrl:n}=t,a=`${_(e.fileName)}.map`;r=n?new URL(a,n).toString():a,s=qo.writeFile(`${i}.map`,e.map.toString());}"hidden"!==t.sourcemap&&(n+=`//# sourceMappingURL=${r}\n`);}return Promise.all([qo.writeFile(i,n),s])}(e,r)))))),await a.hookParallel("writeBundle",[r,s]);}return l=s,{output:Object.values(l).filter((e=>Object.keys(e).length>0)).sort(((e,t)=>{const i=hh(e),s=hh(t);return i===s?0:i<s?-1:1}))};var l;}))}function oh(e,t,i,s){return function(e,t,i){var s,n,r,a,o,l,h;const c=new Set(i),u=e.compact||!1,d=Bl(e),p=Fl(e,t),f=zl(e,p,t),m=Vl(e,f,t),g=jl(e,t),y=Yl(e,g),x={amd:Gl(e),assetFileNames:null!==(s=e.assetFileNames)&&void 0!==s?s:"assets/[name]-[hash][extname]",banner:Hl(e,"banner"),chunkFileNames:null!==(n=e.chunkFileNames)&&void 0!==n?n:"[name]-[hash].js",compact:u,dir:Wl(e,m),dynamicImportFunction:ql(e,t),entryFileNames:Kl(e,c),esModule:null===(r=e.esModule)||void 0===r||r,exports:Xl(e,c),extend:e.extend||!1,externalLiveBindings:null===(a=e.externalLiveBindings)||void 0===a||a,file:m,footer:Hl(e,"footer"),format:d,freeze:null===(o=e.freeze)||void 0===o||o,generatedCode:y,globals:e.globals||{},hoistTransitiveImports:null===(l=e.hoistTransitiveImports)||void 0===l||l,indent:Ql(e,u),inlineDynamicImports:p,interop:Jl(e,t),intro:Hl(e,"intro"),manualChunks:eh(e,p,f,t),minifyInternalExports:th(e,d,u),name:e.name,namespaceToStringTag:ih(e,y,t),noConflict:e.noConflict||!1,outro:Hl(e,"outro"),paths:e.paths||{},plugins:pl(e.plugins),preferConst:g,preserveModules:f,preserveModulesRoot:Ul(e),sanitizeFileName:"function"==typeof e.sanitizeFileName?e.sanitizeFileName:!1===e.sanitizeFileName?e=>e:Ll,sourcemap:e.sourcemap||!1,sourcemapBaseUrl:sh(e),sourcemapExcludeSources:e.sourcemapExcludeSources||!1,sourcemapFile:e.sourcemapFile,sourcemapPathTransform:e.sourcemapPathTransform,strict:null===(h=e.strict)||void 0===h||h,systemNullSetters:e.systemNullSetters||!1,validate:e.validate||!1};return gl(e,Object.keys(x),"output options",t.onwarn),{options:x,unsetOptions:c}}(s.hookReduceArg0Sync("outputOptions",[i.output||i],((e,t)=>t||e),(e=>{const t=()=>e.error({code:me.CANNOT_EMIT_FROM_OPTIONS_HOOK,message:'Cannot emit files or set asset sources in the "outputOptions" hook, use the "renderStart" hook instead.'});return {...e,emitFile:t,setAssetSource:t}})),e,t)}var lh;function hh(e){return "asset"===e.type?lh.ASSET:e.isEntry?lh.ENTRY_CHUNK:lh.SECONDARY_CHUNK}!function(e){e[e.ENTRY_CHUNK=0]="ENTRY_CHUNK",e[e.SECONDARY_CHUNK=1]="SECONDARY_CHUNK",e[e.ASSET=2]="ASSET";}(lh||(lh={}));

  // Reserved word lists for various dialects of the language

  var reservedWords = {
    3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
    5: "class enum extends super const export import",
    6: "enum",
    strict: "implements interface let package private protected public static yield",
    strictBind: "eval arguments"
  };

  // And the keywords

  var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";

  var keywords = {
    5: ecma5AndLessKeywords,
    "5module": ecma5AndLessKeywords + " export import",
    6: ecma5AndLessKeywords + " const class extends export import super"
  };

  var keywordRelationalOperator = /^in(stanceof)?$/;

  // ## Character categories

  // Big ugly regular expressions that match characters in the
  // whitespace, identifier, and identifier-start categories. These
  // are only applied when a character is found to actually have a
  // code point above 128.
  // Generated by `bin/generate-identifier-regex.js`.
  var nonASCIIidentifierStartChars = "\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u037f\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u052f\u0531-\u0556\u0559\u0560-\u0588\u05d0-\u05ea\u05ef-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u0860-\u086a\u08a0-\u08b4\u08b6-\u08c7\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u09fc\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0af9\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c39\u0c3d\u0c58-\u0c5a\u0c60\u0c61\u0c80\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d04-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d54-\u0d56\u0d5f-\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e86-\u0e8a\u0e8c-\u0ea3\u0ea5\u0ea7-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f5\u13f8-\u13fd\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f8\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1878\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191e\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1c80-\u1c88\u1c90-\u1cba\u1cbd-\u1cbf\u1ce9-\u1cec\u1cee-\u1cf3\u1cf5\u1cf6\u1cfa\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2118-\u211d\u2124\u2126\u2128\u212a-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309b-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312f\u3131-\u318e\u31a0-\u31bf\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9ffc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua69d\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua7bf\ua7c2-\ua7ca\ua7f5-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua8fd\ua8fe\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\ua9e0-\ua9e4\ua9e6-\ua9ef\ua9fa-\ua9fe\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa7e-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uab30-\uab5a\uab5c-\uab69\uab70-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc";
  var nonASCIIidentifierChars = "\u200c\u200d\xb7\u0300-\u036f\u0387\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u0669\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u06f0-\u06f9\u0711\u0730-\u074a\u07a6-\u07b0\u07c0-\u07c9\u07eb-\u07f3\u07fd\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u08d3-\u08e1\u08e3-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09cb-\u09cd\u09d7\u09e2\u09e3\u09e6-\u09ef\u09fe\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2\u0ae3\u0ae6-\u0aef\u0afa-\u0aff\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b55-\u0b57\u0b62\u0b63\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c00-\u0c04\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0c66-\u0c6f\u0c81-\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0ce6-\u0cef\u0d00-\u0d03\u0d3b\u0d3c\u0d3e-\u0d44\u0d46-\u0d48\u0d4a-\u0d4d\u0d57\u0d62\u0d63\u0d66-\u0d6f\u0d81-\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0de6-\u0def\u0df2\u0df3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0e50-\u0e59\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ecd\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e\u0f3f\u0f71-\u0f84\u0f86\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e\u1040-\u1049\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u1369-\u1371\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b4-\u17d3\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u18a9\u1920-\u192b\u1930-\u193b\u1946-\u194f\u19d0-\u19da\u1a17-\u1a1b\u1a55-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1ab0-\u1abd\u1abf\u1ac0\u1b00-\u1b04\u1b34-\u1b44\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1b82\u1ba1-\u1bad\u1bb0-\u1bb9\u1be6-\u1bf3\u1c24-\u1c37\u1c40-\u1c49\u1c50-\u1c59\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf4\u1cf7-\u1cf9\u1dc0-\u1df9\u1dfb-\u1dff\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua620-\ua629\ua66f\ua674-\ua67d\ua69e\ua69f\ua6f0\ua6f1\ua802\ua806\ua80b\ua823-\ua827\ua82c\ua880\ua881\ua8b4-\ua8c5\ua8d0-\ua8d9\ua8e0-\ua8f1\ua8ff-\ua909\ua926-\ua92d\ua947-\ua953\ua980-\ua983\ua9b3-\ua9c0\ua9d0-\ua9d9\ua9e5\ua9f0-\ua9f9\uaa29-\uaa36\uaa43\uaa4c\uaa4d\uaa50-\uaa59\uaa7b-\uaa7d\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uaaeb-\uaaef\uaaf5\uaaf6\uabe3-\uabea\uabec\uabed\uabf0-\uabf9\ufb1e\ufe00-\ufe0f\ufe20-\ufe2f\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f";

  var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
  var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");

  nonASCIIidentifierStartChars = nonASCIIidentifierChars = null;

  // These are a run-length and offset encoded representation of the
  // >0xffff code points that are a valid part of identifiers. The
  // offset starts at 0x10000, and each pair of numbers represents an
  // offset to the next range, and then a size of the range. They were
  // generated by bin/generate-identifier-regex.js

  // eslint-disable-next-line comma-spacing
  var astralIdentifierStartCodes = [0,11,2,25,2,18,2,1,2,14,3,13,35,122,70,52,268,28,4,48,48,31,14,29,6,37,11,29,3,35,5,7,2,4,43,157,19,35,5,35,5,39,9,51,157,310,10,21,11,7,153,5,3,0,2,43,2,1,4,0,3,22,11,22,10,30,66,18,2,1,11,21,11,25,71,55,7,1,65,0,16,3,2,2,2,28,43,28,4,28,36,7,2,27,28,53,11,21,11,18,14,17,111,72,56,50,14,50,14,35,349,41,7,1,79,28,11,0,9,21,107,20,28,22,13,52,76,44,33,24,27,35,30,0,3,0,9,34,4,0,13,47,15,3,22,0,2,0,36,17,2,24,85,6,2,0,2,3,2,14,2,9,8,46,39,7,3,1,3,21,2,6,2,1,2,4,4,0,19,0,13,4,159,52,19,3,21,2,31,47,21,1,2,0,185,46,42,3,37,47,21,0,60,42,14,0,72,26,230,43,117,63,32,7,3,0,3,7,2,1,2,23,16,0,2,0,95,7,3,38,17,0,2,0,29,0,11,39,8,0,22,0,12,45,20,0,35,56,264,8,2,36,18,0,50,29,113,6,2,1,2,37,22,0,26,5,2,1,2,31,15,0,328,18,190,0,80,921,103,110,18,195,2749,1070,4050,582,8634,568,8,30,114,29,19,47,17,3,32,20,6,18,689,63,129,74,6,0,67,12,65,1,2,0,29,6135,9,1237,43,8,8952,286,50,2,18,3,9,395,2309,106,6,12,4,8,8,9,5991,84,2,70,2,1,3,0,3,1,3,3,2,11,2,0,2,6,2,64,2,3,3,7,2,6,2,27,2,3,2,4,2,0,4,6,2,339,3,24,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,7,2357,44,11,6,17,0,370,43,1301,196,60,67,8,0,1205,3,2,26,2,1,2,0,3,0,2,9,2,3,2,0,2,0,7,0,5,0,2,0,2,0,2,2,2,1,2,0,3,0,2,0,2,0,2,0,2,0,2,1,2,0,3,3,2,6,2,3,2,3,2,0,2,9,2,16,6,2,2,4,2,16,4421,42717,35,4148,12,221,3,5761,15,7472,3104,541,1507,4938];

  // eslint-disable-next-line comma-spacing
  var astralIdentifierCodes = [509,0,227,0,150,4,294,9,1368,2,2,1,6,3,41,2,5,0,166,1,574,3,9,9,370,1,154,10,176,2,54,14,32,9,16,3,46,10,54,9,7,2,37,13,2,9,6,1,45,0,13,2,49,13,9,3,2,11,83,11,7,0,161,11,6,9,7,3,56,1,2,6,3,1,3,2,10,0,11,1,3,6,4,4,193,17,10,9,5,0,82,19,13,9,214,6,3,8,28,1,83,16,16,9,82,12,9,9,84,14,5,9,243,14,166,9,71,5,2,1,3,3,2,0,2,1,13,9,120,6,3,6,4,0,29,9,41,6,2,3,9,0,10,10,47,15,406,7,2,7,17,9,57,21,2,13,123,5,4,0,2,1,2,6,2,0,9,9,49,4,2,1,2,4,9,9,330,3,19306,9,135,4,60,6,26,9,1014,0,2,54,8,3,82,0,12,1,19628,1,5319,4,4,5,9,7,3,6,31,3,149,2,1418,49,513,54,5,49,9,0,15,0,23,4,2,14,1361,6,2,16,3,6,2,1,2,4,262,6,10,9,419,13,1495,6,110,6,6,9,4759,9,787719,239];

  // This has a complexity linear to the value of the code. The
  // assumption is that looking up astral identifier characters is
  // rare.
  function isInAstralSet(code, set) {
    var pos = 0x10000;
    for (var i = 0; i < set.length; i += 2) {
      pos += set[i];
      if (pos > code) { return false }
      pos += set[i + 1];
      if (pos >= code) { return true }
    }
  }

  // Test whether a given character code starts an identifier.

  function isIdentifierStart(code, astral) {
    if (code < 65) { return code === 36 }
    if (code < 91) { return true }
    if (code < 97) { return code === 95 }
    if (code < 123) { return true }
    if (code <= 0xffff) { return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code)) }
    if (astral === false) { return false }
    return isInAstralSet(code, astralIdentifierStartCodes)
  }

  // Test whether a given character is part of an identifier.

  function isIdentifierChar(code, astral) {
    if (code < 48) { return code === 36 }
    if (code < 58) { return true }
    if (code < 65) { return false }
    if (code < 91) { return true }
    if (code < 97) { return code === 95 }
    if (code < 123) { return true }
    if (code <= 0xffff) { return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code)) }
    if (astral === false) { return false }
    return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes)
  }

  // ## Token types

  // The assignment of fine-grained, information-carrying type objects
  // allows the tokenizer to store the information it has about a
  // token in a way that is very cheap for the parser to look up.

  // All token type variables start with an underscore, to make them
  // easy to recognize.

  // The `beforeExpr` property is used to disambiguate between regular
  // expressions and divisions. It is set on all token types that can
  // be followed by an expression (thus, a slash after them would be a
  // regular expression).
  //
  // The `startsExpr` property is used to check if the token ends a
  // `yield` expression. It is set on all token types that either can
  // directly start an expression (like a quotation mark) or can
  // continue an expression (like the body of a string).
  //
  // `isLoop` marks a keyword as starting a loop, which is important
  // to know when parsing a label, in order to allow or disallow
  // continue jumps to that label.

  var TokenType = function TokenType(label, conf) {
    if ( conf === void 0 ) conf = {};

    this.label = label;
    this.keyword = conf.keyword;
    this.beforeExpr = !!conf.beforeExpr;
    this.startsExpr = !!conf.startsExpr;
    this.isLoop = !!conf.isLoop;
    this.isAssign = !!conf.isAssign;
    this.prefix = !!conf.prefix;
    this.postfix = !!conf.postfix;
    this.binop = conf.binop || null;
    this.updateContext = null;
  };

  function binop(name, prec) {
    return new TokenType(name, {beforeExpr: true, binop: prec})
  }
  var beforeExpr = {beforeExpr: true}, startsExpr = {startsExpr: true};

  // Map keyword names to token types.

  var keywords$1 = {};

  // Succinct definitions of keyword token types
  function kw(name, options) {
    if ( options === void 0 ) options = {};

    options.keyword = name;
    return keywords$1[name] = new TokenType(name, options)
  }

  var types = {
    num: new TokenType("num", startsExpr),
    regexp: new TokenType("regexp", startsExpr),
    string: new TokenType("string", startsExpr),
    name: new TokenType("name", startsExpr),
    eof: new TokenType("eof"),

    // Punctuation token types.
    bracketL: new TokenType("[", {beforeExpr: true, startsExpr: true}),
    bracketR: new TokenType("]"),
    braceL: new TokenType("{", {beforeExpr: true, startsExpr: true}),
    braceR: new TokenType("}"),
    parenL: new TokenType("(", {beforeExpr: true, startsExpr: true}),
    parenR: new TokenType(")"),
    comma: new TokenType(",", beforeExpr),
    semi: new TokenType(";", beforeExpr),
    colon: new TokenType(":", beforeExpr),
    dot: new TokenType("."),
    question: new TokenType("?", beforeExpr),
    questionDot: new TokenType("?."),
    arrow: new TokenType("=>", beforeExpr),
    template: new TokenType("template"),
    invalidTemplate: new TokenType("invalidTemplate"),
    ellipsis: new TokenType("...", beforeExpr),
    backQuote: new TokenType("`", startsExpr),
    dollarBraceL: new TokenType("${", {beforeExpr: true, startsExpr: true}),

    // Operators. These carry several kinds of properties to help the
    // parser use them properly (the presence of these properties is
    // what categorizes them as operators).
    //
    // `binop`, when present, specifies that this operator is a binary
    // operator, and will refer to its precedence.
    //
    // `prefix` and `postfix` mark the operator as a prefix or postfix
    // unary operator.
    //
    // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
    // binary operators with a very low precedence, that should result
    // in AssignmentExpression nodes.

    eq: new TokenType("=", {beforeExpr: true, isAssign: true}),
    assign: new TokenType("_=", {beforeExpr: true, isAssign: true}),
    incDec: new TokenType("++/--", {prefix: true, postfix: true, startsExpr: true}),
    prefix: new TokenType("!/~", {beforeExpr: true, prefix: true, startsExpr: true}),
    logicalOR: binop("||", 1),
    logicalAND: binop("&&", 2),
    bitwiseOR: binop("|", 3),
    bitwiseXOR: binop("^", 4),
    bitwiseAND: binop("&", 5),
    equality: binop("==/!=/===/!==", 6),
    relational: binop("</>/<=/>=", 7),
    bitShift: binop("<</>>/>>>", 8),
    plusMin: new TokenType("+/-", {beforeExpr: true, binop: 9, prefix: true, startsExpr: true}),
    modulo: binop("%", 10),
    star: binop("*", 10),
    slash: binop("/", 10),
    starstar: new TokenType("**", {beforeExpr: true}),
    coalesce: binop("??", 1),

    // Keyword token types.
    _break: kw("break"),
    _case: kw("case", beforeExpr),
    _catch: kw("catch"),
    _continue: kw("continue"),
    _debugger: kw("debugger"),
    _default: kw("default", beforeExpr),
    _do: kw("do", {isLoop: true, beforeExpr: true}),
    _else: kw("else", beforeExpr),
    _finally: kw("finally"),
    _for: kw("for", {isLoop: true}),
    _function: kw("function", startsExpr),
    _if: kw("if"),
    _return: kw("return", beforeExpr),
    _switch: kw("switch"),
    _throw: kw("throw", beforeExpr),
    _try: kw("try"),
    _var: kw("var"),
    _const: kw("const"),
    _while: kw("while", {isLoop: true}),
    _with: kw("with"),
    _new: kw("new", {beforeExpr: true, startsExpr: true}),
    _this: kw("this", startsExpr),
    _super: kw("super", startsExpr),
    _class: kw("class", startsExpr),
    _extends: kw("extends", beforeExpr),
    _export: kw("export"),
    _import: kw("import", startsExpr),
    _null: kw("null", startsExpr),
    _true: kw("true", startsExpr),
    _false: kw("false", startsExpr),
    _in: kw("in", {beforeExpr: true, binop: 7}),
    _instanceof: kw("instanceof", {beforeExpr: true, binop: 7}),
    _typeof: kw("typeof", {beforeExpr: true, prefix: true, startsExpr: true}),
    _void: kw("void", {beforeExpr: true, prefix: true, startsExpr: true}),
    _delete: kw("delete", {beforeExpr: true, prefix: true, startsExpr: true})
  };

  // Matches a whole line break (where CRLF is considered a single
  // line break). Used to count lines.

  var lineBreak = /\r\n?|\n|\u2028|\u2029/;
  var lineBreakG = new RegExp(lineBreak.source, "g");

  function isNewLine(code, ecma2019String) {
    return code === 10 || code === 13 || (!ecma2019String && (code === 0x2028 || code === 0x2029))
  }

  var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;

  var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;

  var ref = Object.prototype;
  var hasOwnProperty = ref.hasOwnProperty;
  var toString = ref.toString;

  // Checks if an object has a property.

  function has(obj, propName) {
    return hasOwnProperty.call(obj, propName)
  }

  var isArray = Array.isArray || (function (obj) { return (
    toString.call(obj) === "[object Array]"
  ); });

  function wordsRegexp(words) {
    return new RegExp("^(?:" + words.replace(/ /g, "|") + ")$")
  }

  // These are used when `options.locations` is on, for the
  // `startLoc` and `endLoc` properties.

  var Position = function Position(line, col) {
    this.line = line;
    this.column = col;
  };

  Position.prototype.offset = function offset (n) {
    return new Position(this.line, this.column + n)
  };

  var SourceLocation = function SourceLocation(p, start, end) {
    this.start = start;
    this.end = end;
    if (p.sourceFile !== null) { this.source = p.sourceFile; }
  };

  // The `getLineInfo` function is mostly useful when the
  // `locations` option is off (for performance reasons) and you
  // want to find the line/column position for a given character
  // offset. `input` should be the code string that the offset refers
  // into.

  function getLineInfo(input, offset) {
    for (var line = 1, cur = 0;;) {
      lineBreakG.lastIndex = cur;
      var match = lineBreakG.exec(input);
      if (match && match.index < offset) {
        ++line;
        cur = match.index + match[0].length;
      } else {
        return new Position(line, offset - cur)
      }
    }
  }

  // A second optional argument can be given to further configure
  // the parser process. These options are recognized:

  var defaultOptions = {
    // `ecmaVersion` indicates the ECMAScript version to parse. Must be
    // either 3, 5, 6 (2015), 7 (2016), 8 (2017), 9 (2018), or 10
    // (2019). This influences support for strict mode, the set of
    // reserved words, and support for new syntax features. The default
    // is 10.
    ecmaVersion: 10,
    // `sourceType` indicates the mode the code should be parsed in.
    // Can be either `"script"` or `"module"`. This influences global
    // strict mode and parsing of `import` and `export` declarations.
    sourceType: "script",
    // `onInsertedSemicolon` can be a callback that will be called
    // when a semicolon is automatically inserted. It will be passed
    // the position of the comma as an offset, and if `locations` is
    // enabled, it is given the location as a `{line, column}` object
    // as second argument.
    onInsertedSemicolon: null,
    // `onTrailingComma` is similar to `onInsertedSemicolon`, but for
    // trailing commas.
    onTrailingComma: null,
    // By default, reserved words are only enforced if ecmaVersion >= 5.
    // Set `allowReserved` to a boolean value to explicitly turn this on
    // an off. When this option has the value "never", reserved words
    // and keywords can also not be used as property names.
    allowReserved: null,
    // When enabled, a return at the top level is not considered an
    // error.
    allowReturnOutsideFunction: false,
    // When enabled, import/export statements are not constrained to
    // appearing at the top of the program.
    allowImportExportEverywhere: false,
    // When enabled, await identifiers are allowed to appear at the top-level scope,
    // but they are still not allowed in non-async functions.
    allowAwaitOutsideFunction: false,
    // When enabled, hashbang directive in the beginning of file
    // is allowed and treated as a line comment.
    allowHashBang: false,
    // When `locations` is on, `loc` properties holding objects with
    // `start` and `end` properties in `{line, column}` form (with
    // line being 1-based and column 0-based) will be attached to the
    // nodes.
    locations: false,
    // A function can be passed as `onToken` option, which will
    // cause Acorn to call that function with object in the same
    // format as tokens returned from `tokenizer().getToken()`. Note
    // that you are not allowed to call the parser from the
    // callback—that will corrupt its internal state.
    onToken: null,
    // A function can be passed as `onComment` option, which will
    // cause Acorn to call that function with `(block, text, start,
    // end)` parameters whenever a comment is skipped. `block` is a
    // boolean indicating whether this is a block (`/* */`) comment,
    // `text` is the content of the comment, and `start` and `end` are
    // character offsets that denote the start and end of the comment.
    // When the `locations` option is on, two more parameters are
    // passed, the full `{line, column}` locations of the start and
    // end of the comments. Note that you are not allowed to call the
    // parser from the callback—that will corrupt its internal state.
    onComment: null,
    // Nodes have their start and end characters offsets recorded in
    // `start` and `end` properties (directly on the node, rather than
    // the `loc` object, which holds line/column data. To also add a
    // [semi-standardized][range] `range` property holding a `[start,
    // end]` array with the same numbers, set the `ranges` option to
    // `true`.
    //
    // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
    ranges: false,
    // It is possible to parse multiple files into a single AST by
    // passing the tree produced by parsing the first file as
    // `program` option in subsequent parses. This will add the
    // toplevel forms of the parsed file to the `Program` (top) node
    // of an existing parse tree.
    program: null,
    // When `locations` is on, you can pass this to record the source
    // file in every node's `loc` object.
    sourceFile: null,
    // This value, if given, is stored in every node, whether
    // `locations` is on or off.
    directSourceFile: null,
    // When enabled, parenthesized expressions are represented by
    // (non-standard) ParenthesizedExpression nodes
    preserveParens: false
  };

  // Interpret and default an options object

  function getOptions(opts) {
    var options = {};

    for (var opt in defaultOptions)
      { options[opt] = opts && has(opts, opt) ? opts[opt] : defaultOptions[opt]; }

    if (options.ecmaVersion >= 2015)
      { options.ecmaVersion -= 2009; }

    if (options.allowReserved == null)
      { options.allowReserved = options.ecmaVersion < 5; }

    if (isArray(options.onToken)) {
      var tokens = options.onToken;
      options.onToken = function (token) { return tokens.push(token); };
    }
    if (isArray(options.onComment))
      { options.onComment = pushComment(options, options.onComment); }

    return options
  }

  function pushComment(options, array) {
    return function(block, text, start, end, startLoc, endLoc) {
      var comment = {
        type: block ? "Block" : "Line",
        value: text,
        start: start,
        end: end
      };
      if (options.locations)
        { comment.loc = new SourceLocation(this, startLoc, endLoc); }
      if (options.ranges)
        { comment.range = [start, end]; }
      array.push(comment);
    }
  }

  // Each scope gets a bitset that may contain these flags
  var
      SCOPE_TOP = 1,
      SCOPE_FUNCTION = 2,
      SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION,
      SCOPE_ASYNC = 4,
      SCOPE_GENERATOR = 8,
      SCOPE_ARROW = 16,
      SCOPE_SIMPLE_CATCH = 32,
      SCOPE_SUPER = 64,
      SCOPE_DIRECT_SUPER = 128;

  function functionFlags(async, generator) {
    return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0)
  }

  // Used in checkLVal and declareName to determine the type of a binding
  var
      BIND_NONE = 0, // Not a binding
      BIND_VAR = 1, // Var-style binding
      BIND_LEXICAL = 2, // Let- or const-style binding
      BIND_FUNCTION = 3, // Function declaration
      BIND_SIMPLE_CATCH = 4, // Simple (identifier pattern) catch binding
      BIND_OUTSIDE = 5; // Special case for function names as bound inside the function

  var Parser = function Parser(options, input, startPos) {
    this.options = options = getOptions(options);
    this.sourceFile = options.sourceFile;
    this.keywords = wordsRegexp(keywords[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
    var reserved = "";
    if (options.allowReserved !== true) {
      for (var v = options.ecmaVersion;; v--)
        { if (reserved = reservedWords[v]) { break } }
      if (options.sourceType === "module") { reserved += " await"; }
    }
    this.reservedWords = wordsRegexp(reserved);
    var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
    this.reservedWordsStrict = wordsRegexp(reservedStrict);
    this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
    this.input = String(input);

    // Used to signal to callers of `readWord1` whether the word
    // contained any escape sequences. This is needed because words with
    // escape sequences must not be interpreted as keywords.
    this.containsEsc = false;

    // Set up token state

    // The current position of the tokenizer in the input.
    if (startPos) {
      this.pos = startPos;
      this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1;
      this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
    } else {
      this.pos = this.lineStart = 0;
      this.curLine = 1;
    }

    // Properties of the current token:
    // Its type
    this.type = types.eof;
    // For tokens that include more information than their type, the value
    this.value = null;
    // Its start and end offset
    this.start = this.end = this.pos;
    // And, if locations are used, the {line, column} object
    // corresponding to those offsets
    this.startLoc = this.endLoc = this.curPosition();

    // Position information for the previous token
    this.lastTokEndLoc = this.lastTokStartLoc = null;
    this.lastTokStart = this.lastTokEnd = this.pos;

    // The context stack is used to superficially track syntactic
    // context to predict whether a regular expression is allowed in a
    // given position.
    this.context = this.initialContext();
    this.exprAllowed = true;

    // Figure out if it's a module code.
    this.inModule = options.sourceType === "module";
    this.strict = this.inModule || this.strictDirective(this.pos);

    // Used to signify the start of a potential arrow function
    this.potentialArrowAt = -1;

    // Positions to delayed-check that yield/await does not exist in default parameters.
    this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
    // Labels in scope.
    this.labels = [];
    // Thus-far undefined exports.
    this.undefinedExports = {};

    // If enabled, skip leading hashbang line.
    if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!")
      { this.skipLineComment(2); }

    // Scope tracking for duplicate variable names (see scope.js)
    this.scopeStack = [];
    this.enterScope(SCOPE_TOP);

    // For RegExp validation
    this.regexpState = null;
  };

  var prototypeAccessors = { inFunction: { configurable: true },inGenerator: { configurable: true },inAsync: { configurable: true },allowSuper: { configurable: true },allowDirectSuper: { configurable: true },treatFunctionsAsVar: { configurable: true } };

  Parser.prototype.parse = function parse () {
    var node = this.options.program || this.startNode();
    this.nextToken();
    return this.parseTopLevel(node)
  };

  prototypeAccessors.inFunction.get = function () { return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0 };
  prototypeAccessors.inGenerator.get = function () { return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0 };
  prototypeAccessors.inAsync.get = function () { return (this.currentVarScope().flags & SCOPE_ASYNC) > 0 };
  prototypeAccessors.allowSuper.get = function () { return (this.currentThisScope().flags & SCOPE_SUPER) > 0 };
  prototypeAccessors.allowDirectSuper.get = function () { return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0 };
  prototypeAccessors.treatFunctionsAsVar.get = function () { return this.treatFunctionsAsVarInScope(this.currentScope()) };

  // Switch to a getter for 7.0.0.
  Parser.prototype.inNonArrowFunction = function inNonArrowFunction () { return (this.currentThisScope().flags & SCOPE_FUNCTION) > 0 };

  Parser.extend = function extend () {
      var plugins = [], len = arguments.length;
      while ( len-- ) plugins[ len ] = arguments[ len ];

    var cls = this;
    for (var i = 0; i < plugins.length; i++) { cls = plugins[i](cls); }
    return cls
  };

  Parser.parse = function parse (input, options) {
    return new this(options, input).parse()
  };

  Parser.parseExpressionAt = function parseExpressionAt (input, pos, options) {
    var parser = new this(options, input, pos);
    parser.nextToken();
    return parser.parseExpression()
  };

  Parser.tokenizer = function tokenizer (input, options) {
    return new this(options, input)
  };

  Object.defineProperties( Parser.prototype, prototypeAccessors );

  var pp = Parser.prototype;

  // ## Parser utilities

  var literal = /^(?:'((?:\\.|[^'\\])*?)'|"((?:\\.|[^"\\])*?)")/;
  pp.strictDirective = function(start) {
    for (;;) {
      // Try to find string literal.
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      var match = literal.exec(this.input.slice(start));
      if (!match) { return false }
      if ((match[1] || match[2]) === "use strict") {
        skipWhiteSpace.lastIndex = start + match[0].length;
        var spaceAfter = skipWhiteSpace.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
        var next = this.input.charAt(end);
        return next === ";" || next === "}" ||
          (lineBreak.test(spaceAfter[0]) &&
           !(/[(`.[+\-/*%<>=,?^&]/.test(next) || next === "!" && this.input.charAt(end + 1) === "="))
      }
      start += match[0].length;

      // Skip semicolon, if any.
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      if (this.input[start] === ";")
        { start++; }
    }
  };

  // Predicate that tests whether the next token is of the given
  // type, and if yes, consumes it as a side effect.

  pp.eat = function(type) {
    if (this.type === type) {
      this.next();
      return true
    } else {
      return false
    }
  };

  // Tests whether parsed token is a contextual keyword.

  pp.isContextual = function(name) {
    return this.type === types.name && this.value === name && !this.containsEsc
  };

  // Consumes contextual keyword if possible.

  pp.eatContextual = function(name) {
    if (!this.isContextual(name)) { return false }
    this.next();
    return true
  };

  // Asserts that following token is given contextual keyword.

  pp.expectContextual = function(name) {
    if (!this.eatContextual(name)) { this.unexpected(); }
  };

  // Test whether a semicolon can be inserted at the current position.

  pp.canInsertSemicolon = function() {
    return this.type === types.eof ||
      this.type === types.braceR ||
      lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  };

  pp.insertSemicolon = function() {
    if (this.canInsertSemicolon()) {
      if (this.options.onInsertedSemicolon)
        { this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc); }
      return true
    }
  };

  // Consume a semicolon, or, failing that, see if we are allowed to
  // pretend that there is a semicolon at this position.

  pp.semicolon = function() {
    if (!this.eat(types.semi) && !this.insertSemicolon()) { this.unexpected(); }
  };

  pp.afterTrailingComma = function(tokType, notNext) {
    if (this.type === tokType) {
      if (this.options.onTrailingComma)
        { this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc); }
      if (!notNext)
        { this.next(); }
      return true
    }
  };

  // Expect a token of a given type. If found, consume it, otherwise,
  // raise an unexpected token error.

  pp.expect = function(type) {
    this.eat(type) || this.unexpected();
  };

  // Raise an unexpected token error.

  pp.unexpected = function(pos) {
    this.raise(pos != null ? pos : this.start, "Unexpected token");
  };

  function DestructuringErrors() {
    this.shorthandAssign =
    this.trailingComma =
    this.parenthesizedAssign =
    this.parenthesizedBind =
    this.doubleProto =
      -1;
  }

  pp.checkPatternErrors = function(refDestructuringErrors, isAssign) {
    if (!refDestructuringErrors) { return }
    if (refDestructuringErrors.trailingComma > -1)
      { this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element"); }
    var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
    if (parens > -1) { this.raiseRecoverable(parens, "Parenthesized pattern"); }
  };

  pp.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
    if (!refDestructuringErrors) { return false }
    var shorthandAssign = refDestructuringErrors.shorthandAssign;
    var doubleProto = refDestructuringErrors.doubleProto;
    if (!andThrow) { return shorthandAssign >= 0 || doubleProto >= 0 }
    if (shorthandAssign >= 0)
      { this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns"); }
    if (doubleProto >= 0)
      { this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property"); }
  };

  pp.checkYieldAwaitInDefaultParams = function() {
    if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos))
      { this.raise(this.yieldPos, "Yield expression cannot be a default value"); }
    if (this.awaitPos)
      { this.raise(this.awaitPos, "Await expression cannot be a default value"); }
  };

  pp.isSimpleAssignTarget = function(expr) {
    if (expr.type === "ParenthesizedExpression")
      { return this.isSimpleAssignTarget(expr.expression) }
    return expr.type === "Identifier" || expr.type === "MemberExpression"
  };

  var pp$1 = Parser.prototype;

  // ### Statement parsing

  // Parse a program. Initializes the parser, reads any number of
  // statements, and wraps them in a Program node.  Optionally takes a
  // `program` argument.  If present, the statements will be appended
  // to its body instead of creating a new node.

  pp$1.parseTopLevel = function(node) {
    var exports = {};
    if (!node.body) { node.body = []; }
    while (this.type !== types.eof) {
      var stmt = this.parseStatement(null, true, exports);
      node.body.push(stmt);
    }
    if (this.inModule)
      { for (var i = 0, list = Object.keys(this.undefinedExports); i < list.length; i += 1)
        {
          var name = list[i];

          this.raiseRecoverable(this.undefinedExports[name].start, ("Export '" + name + "' is not defined"));
        } }
    this.adaptDirectivePrologue(node.body);
    this.next();
    node.sourceType = this.options.sourceType;
    return this.finishNode(node, "Program")
  };

  var loopLabel = {kind: "loop"}, switchLabel = {kind: "switch"};

  pp$1.isLet = function(context) {
    if (this.options.ecmaVersion < 6 || !this.isContextual("let")) { return false }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
    // For ambiguous cases, determine if a LexicalDeclaration (or only a
    // Statement) is allowed here. If context is not empty then only a Statement
    // is allowed. However, `let [` is an explicit negative lookahead for
    // ExpressionStatement, so special-case it first.
    if (nextCh === 91) { return true } // '['
    if (context) { return false }

    if (nextCh === 123) { return true } // '{'
    if (isIdentifierStart(nextCh, true)) {
      var pos = next + 1;
      while (isIdentifierChar(this.input.charCodeAt(pos), true)) { ++pos; }
      var ident = this.input.slice(next, pos);
      if (!keywordRelationalOperator.test(ident)) { return true }
    }
    return false
  };

  // check 'async [no LineTerminator here] function'
  // - 'async /*foo*/ function' is OK.
  // - 'async /*\n*/ function' is invalid.
  pp$1.isAsyncFunction = function() {
    if (this.options.ecmaVersion < 8 || !this.isContextual("async"))
      { return false }

    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length;
    return !lineBreak.test(this.input.slice(this.pos, next)) &&
      this.input.slice(next, next + 8) === "function" &&
      (next + 8 === this.input.length || !isIdentifierChar(this.input.charAt(next + 8)))
  };

  // Parse a single statement.
  //
  // If expecting a statement and finding a slash operator, parse a
  // regular expression literal. This is to handle cases like
  // `if (foo) /blah/.exec(foo)`, where looking at the previous token
  // does not help.

  pp$1.parseStatement = function(context, topLevel, exports) {
    var starttype = this.type, node = this.startNode(), kind;

    if (this.isLet(context)) {
      starttype = types._var;
      kind = "let";
    }

    // Most types of statements are recognized by the keyword they
    // start with. Many are trivial to parse, some require a bit of
    // complexity.

    switch (starttype) {
    case types._break: case types._continue: return this.parseBreakContinueStatement(node, starttype.keyword)
    case types._debugger: return this.parseDebuggerStatement(node)
    case types._do: return this.parseDoStatement(node)
    case types._for: return this.parseForStatement(node)
    case types._function:
      // Function as sole body of either an if statement or a labeled statement
      // works, but not when it is part of a labeled statement that is the sole
      // body of an if statement.
      if ((context && (this.strict || context !== "if" && context !== "label")) && this.options.ecmaVersion >= 6) { this.unexpected(); }
      return this.parseFunctionStatement(node, false, !context)
    case types._class:
      if (context) { this.unexpected(); }
      return this.parseClass(node, true)
    case types._if: return this.parseIfStatement(node)
    case types._return: return this.parseReturnStatement(node)
    case types._switch: return this.parseSwitchStatement(node)
    case types._throw: return this.parseThrowStatement(node)
    case types._try: return this.parseTryStatement(node)
    case types._const: case types._var:
      kind = kind || this.value;
      if (context && kind !== "var") { this.unexpected(); }
      return this.parseVarStatement(node, kind)
    case types._while: return this.parseWhileStatement(node)
    case types._with: return this.parseWithStatement(node)
    case types.braceL: return this.parseBlock(true, node)
    case types.semi: return this.parseEmptyStatement(node)
    case types._export:
    case types._import:
      if (this.options.ecmaVersion > 10 && starttype === types._import) {
        skipWhiteSpace.lastIndex = this.pos;
        var skip = skipWhiteSpace.exec(this.input);
        var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
        if (nextCh === 40 || nextCh === 46) // '(' or '.'
          { return this.parseExpressionStatement(node, this.parseExpression()) }
      }

      if (!this.options.allowImportExportEverywhere) {
        if (!topLevel)
          { this.raise(this.start, "'import' and 'export' may only appear at the top level"); }
        if (!this.inModule)
          { this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'"); }
      }
      return starttype === types._import ? this.parseImport(node) : this.parseExport(node, exports)

      // If the statement does not start with a statement keyword or a
      // brace, it's an ExpressionStatement or LabeledStatement. We
      // simply start parsing an expression, and afterwards, if the
      // next token is a colon and the expression was a simple
      // Identifier node, we switch to interpreting it as a label.
    default:
      if (this.isAsyncFunction()) {
        if (context) { this.unexpected(); }
        this.next();
        return this.parseFunctionStatement(node, true, !context)
      }

      var maybeName = this.value, expr = this.parseExpression();
      if (starttype === types.name && expr.type === "Identifier" && this.eat(types.colon))
        { return this.parseLabeledStatement(node, maybeName, expr, context) }
      else { return this.parseExpressionStatement(node, expr) }
    }
  };

  pp$1.parseBreakContinueStatement = function(node, keyword) {
    var isBreak = keyword === "break";
    this.next();
    if (this.eat(types.semi) || this.insertSemicolon()) { node.label = null; }
    else if (this.type !== types.name) { this.unexpected(); }
    else {
      node.label = this.parseIdent();
      this.semicolon();
    }

    // Verify that there is an actual destination to break or
    // continue to.
    var i = 0;
    for (; i < this.labels.length; ++i) {
      var lab = this.labels[i];
      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) { break }
        if (node.label && isBreak) { break }
      }
    }
    if (i === this.labels.length) { this.raise(node.start, "Unsyntactic " + keyword); }
    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement")
  };

  pp$1.parseDebuggerStatement = function(node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement")
  };

  pp$1.parseDoStatement = function(node) {
    this.next();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("do");
    this.labels.pop();
    this.expect(types._while);
    node.test = this.parseParenExpression();
    if (this.options.ecmaVersion >= 6)
      { this.eat(types.semi); }
    else
      { this.semicolon(); }
    return this.finishNode(node, "DoWhileStatement")
  };

  // Disambiguating between a `for` and a `for`/`in` or `for`/`of`
  // loop is non-trivial. Basically, we have to parse the init `var`
  // statement or expression, disallowing the `in` operator (see
  // the second parameter to `parseExpression`), and then check
  // whether the next token is `in` or `of`. When there is no init
  // part (semicolon immediately after the opening parenthesis), it
  // is a regular `for` loop.

  pp$1.parseForStatement = function(node) {
    this.next();
    var awaitAt = (this.options.ecmaVersion >= 9 && (this.inAsync || (!this.inFunction && this.options.allowAwaitOutsideFunction)) && this.eatContextual("await")) ? this.lastTokStart : -1;
    this.labels.push(loopLabel);
    this.enterScope(0);
    this.expect(types.parenL);
    if (this.type === types.semi) {
      if (awaitAt > -1) { this.unexpected(awaitAt); }
      return this.parseFor(node, null)
    }
    var isLet = this.isLet();
    if (this.type === types._var || this.type === types._const || isLet) {
      var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
      this.next();
      this.parseVar(init$1, true, kind);
      this.finishNode(init$1, "VariableDeclaration");
      if ((this.type === types._in || (this.options.ecmaVersion >= 6 && this.isContextual("of"))) && init$1.declarations.length === 1) {
        if (this.options.ecmaVersion >= 9) {
          if (this.type === types._in) {
            if (awaitAt > -1) { this.unexpected(awaitAt); }
          } else { node.await = awaitAt > -1; }
        }
        return this.parseForIn(node, init$1)
      }
      if (awaitAt > -1) { this.unexpected(awaitAt); }
      return this.parseFor(node, init$1)
    }
    var refDestructuringErrors = new DestructuringErrors;
    var init = this.parseExpression(true, refDestructuringErrors);
    if (this.type === types._in || (this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
      if (this.options.ecmaVersion >= 9) {
        if (this.type === types._in) {
          if (awaitAt > -1) { this.unexpected(awaitAt); }
        } else { node.await = awaitAt > -1; }
      }
      this.toAssignable(init, false, refDestructuringErrors);
      this.checkLVal(init);
      return this.parseForIn(node, init)
    } else {
      this.checkExpressionErrors(refDestructuringErrors, true);
    }
    if (awaitAt > -1) { this.unexpected(awaitAt); }
    return this.parseFor(node, init)
  };

  pp$1.parseFunctionStatement = function(node, isAsync, declarationPosition) {
    this.next();
    return this.parseFunction(node, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), false, isAsync)
  };

  pp$1.parseIfStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    // allow function declarations in branches, but only in non-strict mode
    node.consequent = this.parseStatement("if");
    node.alternate = this.eat(types._else) ? this.parseStatement("if") : null;
    return this.finishNode(node, "IfStatement")
  };

  pp$1.parseReturnStatement = function(node) {
    if (!this.inFunction && !this.options.allowReturnOutsideFunction)
      { this.raise(this.start, "'return' outside of function"); }
    this.next();

    // In `return` (and `break`/`continue`), the keywords with
    // optional arguments, we eagerly look for a semicolon or the
    // possibility to insert one.

    if (this.eat(types.semi) || this.insertSemicolon()) { node.argument = null; }
    else { node.argument = this.parseExpression(); this.semicolon(); }
    return this.finishNode(node, "ReturnStatement")
  };

  pp$1.parseSwitchStatement = function(node) {
    this.next();
    node.discriminant = this.parseParenExpression();
    node.cases = [];
    this.expect(types.braceL);
    this.labels.push(switchLabel);
    this.enterScope(0);

    // Statements under must be grouped (by label) in SwitchCase
    // nodes. `cur` is used to keep the node that we are currently
    // adding statements to.

    var cur;
    for (var sawDefault = false; this.type !== types.braceR;) {
      if (this.type === types._case || this.type === types._default) {
        var isCase = this.type === types._case;
        if (cur) { this.finishNode(cur, "SwitchCase"); }
        node.cases.push(cur = this.startNode());
        cur.consequent = [];
        this.next();
        if (isCase) {
          cur.test = this.parseExpression();
        } else {
          if (sawDefault) { this.raiseRecoverable(this.lastTokStart, "Multiple default clauses"); }
          sawDefault = true;
          cur.test = null;
        }
        this.expect(types.colon);
      } else {
        if (!cur) { this.unexpected(); }
        cur.consequent.push(this.parseStatement(null));
      }
    }
    this.exitScope();
    if (cur) { this.finishNode(cur, "SwitchCase"); }
    this.next(); // Closing brace
    this.labels.pop();
    return this.finishNode(node, "SwitchStatement")
  };

  pp$1.parseThrowStatement = function(node) {
    this.next();
    if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start)))
      { this.raise(this.lastTokEnd, "Illegal newline after throw"); }
    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement")
  };

  // Reused empty array added for node fields that are always empty.

  var empty = [];

  pp$1.parseTryStatement = function(node) {
    this.next();
    node.block = this.parseBlock();
    node.handler = null;
    if (this.type === types._catch) {
      var clause = this.startNode();
      this.next();
      if (this.eat(types.parenL)) {
        clause.param = this.parseBindingAtom();
        var simple = clause.param.type === "Identifier";
        this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
        this.checkLVal(clause.param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
        this.expect(types.parenR);
      } else {
        if (this.options.ecmaVersion < 10) { this.unexpected(); }
        clause.param = null;
        this.enterScope(0);
      }
      clause.body = this.parseBlock(false);
      this.exitScope();
      node.handler = this.finishNode(clause, "CatchClause");
    }
    node.finalizer = this.eat(types._finally) ? this.parseBlock() : null;
    if (!node.handler && !node.finalizer)
      { this.raise(node.start, "Missing catch or finally clause"); }
    return this.finishNode(node, "TryStatement")
  };

  pp$1.parseVarStatement = function(node, kind) {
    this.next();
    this.parseVar(node, false, kind);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration")
  };

  pp$1.parseWhileStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("while");
    this.labels.pop();
    return this.finishNode(node, "WhileStatement")
  };

  pp$1.parseWithStatement = function(node) {
    if (this.strict) { this.raise(this.start, "'with' in strict mode"); }
    this.next();
    node.object = this.parseParenExpression();
    node.body = this.parseStatement("with");
    return this.finishNode(node, "WithStatement")
  };

  pp$1.parseEmptyStatement = function(node) {
    this.next();
    return this.finishNode(node, "EmptyStatement")
  };

  pp$1.parseLabeledStatement = function(node, maybeName, expr, context) {
    for (var i$1 = 0, list = this.labels; i$1 < list.length; i$1 += 1)
      {
      var label = list[i$1];

      if (label.name === maybeName)
        { this.raise(expr.start, "Label '" + maybeName + "' is already declared");
    } }
    var kind = this.type.isLoop ? "loop" : this.type === types._switch ? "switch" : null;
    for (var i = this.labels.length - 1; i >= 0; i--) {
      var label$1 = this.labels[i];
      if (label$1.statementStart === node.start) {
        // Update information about previous labels on this node
        label$1.statementStart = this.start;
        label$1.kind = kind;
      } else { break }
    }
    this.labels.push({name: maybeName, kind: kind, statementStart: this.start});
    node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
    this.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement")
  };

  pp$1.parseExpressionStatement = function(node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement")
  };

  // Parse a semicolon-enclosed block of statements, handling `"use
  // strict"` declarations when `allowStrict` is true (used for
  // function bodies).

  pp$1.parseBlock = function(createNewLexicalScope, node, exitStrict) {
    if ( createNewLexicalScope === void 0 ) createNewLexicalScope = true;
    if ( node === void 0 ) node = this.startNode();

    node.body = [];
    this.expect(types.braceL);
    if (createNewLexicalScope) { this.enterScope(0); }
    while (this.type !== types.braceR) {
      var stmt = this.parseStatement(null);
      node.body.push(stmt);
    }
    if (exitStrict) { this.strict = false; }
    this.next();
    if (createNewLexicalScope) { this.exitScope(); }
    return this.finishNode(node, "BlockStatement")
  };

  // Parse a regular `for` loop. The disambiguation code in
  // `parseStatement` will already have parsed the init statement or
  // expression.

  pp$1.parseFor = function(node, init) {
    node.init = init;
    this.expect(types.semi);
    node.test = this.type === types.semi ? null : this.parseExpression();
    this.expect(types.semi);
    node.update = this.type === types.parenR ? null : this.parseExpression();
    this.expect(types.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, "ForStatement")
  };

  // Parse a `for`/`in` and `for`/`of` loop, which are almost
  // same from parser's perspective.

  pp$1.parseForIn = function(node, init) {
    var isForIn = this.type === types._in;
    this.next();

    if (
      init.type === "VariableDeclaration" &&
      init.declarations[0].init != null &&
      (
        !isForIn ||
        this.options.ecmaVersion < 8 ||
        this.strict ||
        init.kind !== "var" ||
        init.declarations[0].id.type !== "Identifier"
      )
    ) {
      this.raise(
        init.start,
        ((isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer")
      );
    } else if (init.type === "AssignmentPattern") {
      this.raise(init.start, "Invalid left-hand side in for-loop");
    }
    node.left = init;
    node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
    this.expect(types.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement")
  };

  // Parse a list of variable declarations.

  pp$1.parseVar = function(node, isFor, kind) {
    node.declarations = [];
    node.kind = kind;
    for (;;) {
      var decl = this.startNode();
      this.parseVarId(decl, kind);
      if (this.eat(types.eq)) {
        decl.init = this.parseMaybeAssign(isFor);
      } else if (kind === "const" && !(this.type === types._in || (this.options.ecmaVersion >= 6 && this.isContextual("of")))) {
        this.unexpected();
      } else if (decl.id.type !== "Identifier" && !(isFor && (this.type === types._in || this.isContextual("of")))) {
        this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
      } else {
        decl.init = null;
      }
      node.declarations.push(this.finishNode(decl, "VariableDeclarator"));
      if (!this.eat(types.comma)) { break }
    }
    return node
  };

  pp$1.parseVarId = function(decl, kind) {
    decl.id = this.parseBindingAtom();
    this.checkLVal(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
  };

  var FUNC_STATEMENT = 1, FUNC_HANGING_STATEMENT = 2, FUNC_NULLABLE_ID = 4;

  // Parse a function declaration or literal (depending on the
  // `statement & FUNC_STATEMENT`).

  // Remove `allowExpressionBody` for 7.0.0, as it is only called with false
  pp$1.parseFunction = function(node, statement, allowExpressionBody, isAsync) {
    this.initFunction(node);
    if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
      if (this.type === types.star && (statement & FUNC_HANGING_STATEMENT))
        { this.unexpected(); }
      node.generator = this.eat(types.star);
    }
    if (this.options.ecmaVersion >= 8)
      { node.async = !!isAsync; }

    if (statement & FUNC_STATEMENT) {
      node.id = (statement & FUNC_NULLABLE_ID) && this.type !== types.name ? null : this.parseIdent();
      if (node.id && !(statement & FUNC_HANGING_STATEMENT))
        // If it is a regular function declaration in sloppy mode, then it is
        // subject to Annex B semantics (BIND_FUNCTION). Otherwise, the binding
        // mode depends on properties of the current scope (see
        // treatFunctionsAsVar).
        { this.checkLVal(node.id, (this.strict || node.generator || node.async) ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION); }
    }

    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(node.async, node.generator));

    if (!(statement & FUNC_STATEMENT))
      { node.id = this.type === types.name ? this.parseIdent() : null; }

    this.parseFunctionParams(node);
    this.parseFunctionBody(node, allowExpressionBody, false);

    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, (statement & FUNC_STATEMENT) ? "FunctionDeclaration" : "FunctionExpression")
  };

  pp$1.parseFunctionParams = function(node) {
    this.expect(types.parenL);
    node.params = this.parseBindingList(types.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
  };

  // Parse a class declaration or literal (depending on the
  // `isStatement` parameter).

  pp$1.parseClass = function(node, isStatement) {
    this.next();

    // ecma-262 14.6 Class Definitions
    // A class definition is always strict mode code.
    var oldStrict = this.strict;
    this.strict = true;

    this.parseClassId(node, isStatement);
    this.parseClassSuper(node);
    var classBody = this.startNode();
    var hadConstructor = false;
    classBody.body = [];
    this.expect(types.braceL);
    while (this.type !== types.braceR) {
      var element = this.parseClassElement(node.superClass !== null);
      if (element) {
        classBody.body.push(element);
        if (element.type === "MethodDefinition" && element.kind === "constructor") {
          if (hadConstructor) { this.raise(element.start, "Duplicate constructor in the same class"); }
          hadConstructor = true;
        }
      }
    }
    this.strict = oldStrict;
    this.next();
    node.body = this.finishNode(classBody, "ClassBody");
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression")
  };

  pp$1.parseClassElement = function(constructorAllowsSuper) {
    var this$1$1 = this;

    if (this.eat(types.semi)) { return null }

    var method = this.startNode();
    var tryContextual = function (k, noLineBreak) {
      if ( noLineBreak === void 0 ) noLineBreak = false;

      var start = this$1$1.start, startLoc = this$1$1.startLoc;
      if (!this$1$1.eatContextual(k)) { return false }
      if (this$1$1.type !== types.parenL && (!noLineBreak || !this$1$1.canInsertSemicolon())) { return true }
      if (method.key) { this$1$1.unexpected(); }
      method.computed = false;
      method.key = this$1$1.startNodeAt(start, startLoc);
      method.key.name = k;
      this$1$1.finishNode(method.key, "Identifier");
      return false
    };

    method.kind = "method";
    method.static = tryContextual("static");
    var isGenerator = this.eat(types.star);
    var isAsync = false;
    if (!isGenerator) {
      if (this.options.ecmaVersion >= 8 && tryContextual("async", true)) {
        isAsync = true;
        isGenerator = this.options.ecmaVersion >= 9 && this.eat(types.star);
      } else if (tryContextual("get")) {
        method.kind = "get";
      } else if (tryContextual("set")) {
        method.kind = "set";
      }
    }
    if (!method.key) { this.parsePropertyName(method); }
    var key = method.key;
    var allowsDirectSuper = false;
    if (!method.computed && !method.static && (key.type === "Identifier" && key.name === "constructor" ||
        key.type === "Literal" && key.value === "constructor")) {
      if (method.kind !== "method") { this.raise(key.start, "Constructor can't have get/set modifier"); }
      if (isGenerator) { this.raise(key.start, "Constructor can't be a generator"); }
      if (isAsync) { this.raise(key.start, "Constructor can't be an async method"); }
      method.kind = "constructor";
      allowsDirectSuper = constructorAllowsSuper;
    } else if (method.static && key.type === "Identifier" && key.name === "prototype") {
      this.raise(key.start, "Classes may not have a static property named prototype");
    }
    this.parseClassMethod(method, isGenerator, isAsync, allowsDirectSuper);
    if (method.kind === "get" && method.value.params.length !== 0)
      { this.raiseRecoverable(method.value.start, "getter should have no params"); }
    if (method.kind === "set" && method.value.params.length !== 1)
      { this.raiseRecoverable(method.value.start, "setter should have exactly one param"); }
    if (method.kind === "set" && method.value.params[0].type === "RestElement")
      { this.raiseRecoverable(method.value.params[0].start, "Setter cannot use rest params"); }
    return method
  };

  pp$1.parseClassMethod = function(method, isGenerator, isAsync, allowsDirectSuper) {
    method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);
    return this.finishNode(method, "MethodDefinition")
  };

  pp$1.parseClassId = function(node, isStatement) {
    if (this.type === types.name) {
      node.id = this.parseIdent();
      if (isStatement)
        { this.checkLVal(node.id, BIND_LEXICAL, false); }
    } else {
      if (isStatement === true)
        { this.unexpected(); }
      node.id = null;
    }
  };

  pp$1.parseClassSuper = function(node) {
    node.superClass = this.eat(types._extends) ? this.parseExprSubscripts() : null;
  };

  // Parses module export declaration.

  pp$1.parseExport = function(node, exports) {
    this.next();
    // export * from '...'
    if (this.eat(types.star)) {
      if (this.options.ecmaVersion >= 11) {
        if (this.eatContextual("as")) {
          node.exported = this.parseIdent(true);
          this.checkExport(exports, node.exported.name, this.lastTokStart);
        } else {
          node.exported = null;
        }
      }
      this.expectContextual("from");
      if (this.type !== types.string) { this.unexpected(); }
      node.source = this.parseExprAtom();
      this.semicolon();
      return this.finishNode(node, "ExportAllDeclaration")
    }
    if (this.eat(types._default)) { // export default ...
      this.checkExport(exports, "default", this.lastTokStart);
      var isAsync;
      if (this.type === types._function || (isAsync = this.isAsyncFunction())) {
        var fNode = this.startNode();
        this.next();
        if (isAsync) { this.next(); }
        node.declaration = this.parseFunction(fNode, FUNC_STATEMENT | FUNC_NULLABLE_ID, false, isAsync);
      } else if (this.type === types._class) {
        var cNode = this.startNode();
        node.declaration = this.parseClass(cNode, "nullableID");
      } else {
        node.declaration = this.parseMaybeAssign();
        this.semicolon();
      }
      return this.finishNode(node, "ExportDefaultDeclaration")
    }
    // export var|const|let|function|class ...
    if (this.shouldParseExportStatement()) {
      node.declaration = this.parseStatement(null);
      if (node.declaration.type === "VariableDeclaration")
        { this.checkVariableExport(exports, node.declaration.declarations); }
      else
        { this.checkExport(exports, node.declaration.id.name, node.declaration.id.start); }
      node.specifiers = [];
      node.source = null;
    } else { // export { x, y as z } [from '...']
      node.declaration = null;
      node.specifiers = this.parseExportSpecifiers(exports);
      if (this.eatContextual("from")) {
        if (this.type !== types.string) { this.unexpected(); }
        node.source = this.parseExprAtom();
      } else {
        for (var i = 0, list = node.specifiers; i < list.length; i += 1) {
          // check for keywords used as local names
          var spec = list[i];

          this.checkUnreserved(spec.local);
          // check if export is defined
          this.checkLocalExport(spec.local);
        }

        node.source = null;
      }
      this.semicolon();
    }
    return this.finishNode(node, "ExportNamedDeclaration")
  };

  pp$1.checkExport = function(exports, name, pos) {
    if (!exports) { return }
    if (has(exports, name))
      { this.raiseRecoverable(pos, "Duplicate export '" + name + "'"); }
    exports[name] = true;
  };

  pp$1.checkPatternExport = function(exports, pat) {
    var type = pat.type;
    if (type === "Identifier")
      { this.checkExport(exports, pat.name, pat.start); }
    else if (type === "ObjectPattern")
      { for (var i = 0, list = pat.properties; i < list.length; i += 1)
        {
          var prop = list[i];

          this.checkPatternExport(exports, prop);
        } }
    else if (type === "ArrayPattern")
      { for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
        var elt = list$1[i$1];

          if (elt) { this.checkPatternExport(exports, elt); }
      } }
    else if (type === "Property")
      { this.checkPatternExport(exports, pat.value); }
    else if (type === "AssignmentPattern")
      { this.checkPatternExport(exports, pat.left); }
    else if (type === "RestElement")
      { this.checkPatternExport(exports, pat.argument); }
    else if (type === "ParenthesizedExpression")
      { this.checkPatternExport(exports, pat.expression); }
  };

  pp$1.checkVariableExport = function(exports, decls) {
    if (!exports) { return }
    for (var i = 0, list = decls; i < list.length; i += 1)
      {
      var decl = list[i];

      this.checkPatternExport(exports, decl.id);
    }
  };

  pp$1.shouldParseExportStatement = function() {
    return this.type.keyword === "var" ||
      this.type.keyword === "const" ||
      this.type.keyword === "class" ||
      this.type.keyword === "function" ||
      this.isLet() ||
      this.isAsyncFunction()
  };

  // Parses a comma-separated list of module exports.

  pp$1.parseExportSpecifiers = function(exports) {
    var nodes = [], first = true;
    // export { x, y as z } [from '...']
    this.expect(types.braceL);
    while (!this.eat(types.braceR)) {
      if (!first) {
        this.expect(types.comma);
        if (this.afterTrailingComma(types.braceR)) { break }
      } else { first = false; }

      var node = this.startNode();
      node.local = this.parseIdent(true);
      node.exported = this.eatContextual("as") ? this.parseIdent(true) : node.local;
      this.checkExport(exports, node.exported.name, node.exported.start);
      nodes.push(this.finishNode(node, "ExportSpecifier"));
    }
    return nodes
  };

  // Parses import declaration.

  pp$1.parseImport = function(node) {
    this.next();
    // import '...'
    if (this.type === types.string) {
      node.specifiers = empty;
      node.source = this.parseExprAtom();
    } else {
      node.specifiers = this.parseImportSpecifiers();
      this.expectContextual("from");
      node.source = this.type === types.string ? this.parseExprAtom() : this.unexpected();
    }
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration")
  };

  // Parses a comma-separated list of module imports.

  pp$1.parseImportSpecifiers = function() {
    var nodes = [], first = true;
    if (this.type === types.name) {
      // import defaultObj, { x, y as z } from '...'
      var node = this.startNode();
      node.local = this.parseIdent();
      this.checkLVal(node.local, BIND_LEXICAL);
      nodes.push(this.finishNode(node, "ImportDefaultSpecifier"));
      if (!this.eat(types.comma)) { return nodes }
    }
    if (this.type === types.star) {
      var node$1 = this.startNode();
      this.next();
      this.expectContextual("as");
      node$1.local = this.parseIdent();
      this.checkLVal(node$1.local, BIND_LEXICAL);
      nodes.push(this.finishNode(node$1, "ImportNamespaceSpecifier"));
      return nodes
    }
    this.expect(types.braceL);
    while (!this.eat(types.braceR)) {
      if (!first) {
        this.expect(types.comma);
        if (this.afterTrailingComma(types.braceR)) { break }
      } else { first = false; }

      var node$2 = this.startNode();
      node$2.imported = this.parseIdent(true);
      if (this.eatContextual("as")) {
        node$2.local = this.parseIdent();
      } else {
        this.checkUnreserved(node$2.imported);
        node$2.local = node$2.imported;
      }
      this.checkLVal(node$2.local, BIND_LEXICAL);
      nodes.push(this.finishNode(node$2, "ImportSpecifier"));
    }
    return nodes
  };

  // Set `ExpressionStatement#directive` property for directive prologues.
  pp$1.adaptDirectivePrologue = function(statements) {
    for (var i = 0; i < statements.length && this.isDirectiveCandidate(statements[i]); ++i) {
      statements[i].directive = statements[i].expression.raw.slice(1, -1);
    }
  };
  pp$1.isDirectiveCandidate = function(statement) {
    return (
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "Literal" &&
      typeof statement.expression.value === "string" &&
      // Reject parenthesized strings.
      (this.input[statement.start] === "\"" || this.input[statement.start] === "'")
    )
  };

  var pp$2 = Parser.prototype;

  // Convert existing expression atom to assignable pattern
  // if possible.

  pp$2.toAssignable = function(node, isBinding, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 6 && node) {
      switch (node.type) {
      case "Identifier":
        if (this.inAsync && node.name === "await")
          { this.raise(node.start, "Cannot use 'await' as identifier inside an async function"); }
        break

      case "ObjectPattern":
      case "ArrayPattern":
      case "RestElement":
        break

      case "ObjectExpression":
        node.type = "ObjectPattern";
        if (refDestructuringErrors) { this.checkPatternErrors(refDestructuringErrors, true); }
        for (var i = 0, list = node.properties; i < list.length; i += 1) {
          var prop = list[i];

        this.toAssignable(prop, isBinding);
          // Early error:
          //   AssignmentRestProperty[Yield, Await] :
          //     `...` DestructuringAssignmentTarget[Yield, Await]
          //
          //   It is a Syntax Error if |DestructuringAssignmentTarget| is an |ArrayLiteral| or an |ObjectLiteral|.
          if (
            prop.type === "RestElement" &&
            (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")
          ) {
            this.raise(prop.argument.start, "Unexpected token");
          }
        }
        break

      case "Property":
        // AssignmentProperty has type === "Property"
        if (node.kind !== "init") { this.raise(node.key.start, "Object pattern can't contain getter or setter"); }
        this.toAssignable(node.value, isBinding);
        break

      case "ArrayExpression":
        node.type = "ArrayPattern";
        if (refDestructuringErrors) { this.checkPatternErrors(refDestructuringErrors, true); }
        this.toAssignableList(node.elements, isBinding);
        break

      case "SpreadElement":
        node.type = "RestElement";
        this.toAssignable(node.argument, isBinding);
        if (node.argument.type === "AssignmentPattern")
          { this.raise(node.argument.start, "Rest elements cannot have a default value"); }
        break

      case "AssignmentExpression":
        if (node.operator !== "=") { this.raise(node.left.end, "Only '=' operator can be used for specifying default value."); }
        node.type = "AssignmentPattern";
        delete node.operator;
        this.toAssignable(node.left, isBinding);
        // falls through to AssignmentPattern

      case "AssignmentPattern":
        break

      case "ParenthesizedExpression":
        this.toAssignable(node.expression, isBinding, refDestructuringErrors);
        break

      case "ChainExpression":
        this.raiseRecoverable(node.start, "Optional chaining cannot appear in left-hand side");
        break

      case "MemberExpression":
        if (!isBinding) { break }

      default:
        this.raise(node.start, "Assigning to rvalue");
      }
    } else if (refDestructuringErrors) { this.checkPatternErrors(refDestructuringErrors, true); }
    return node
  };

  // Convert list of expression atoms to binding list.

  pp$2.toAssignableList = function(exprList, isBinding) {
    var end = exprList.length;
    for (var i = 0; i < end; i++) {
      var elt = exprList[i];
      if (elt) { this.toAssignable(elt, isBinding); }
    }
    if (end) {
      var last = exprList[end - 1];
      if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier")
        { this.unexpected(last.argument.start); }
    }
    return exprList
  };

  // Parses spread element.

  pp$2.parseSpread = function(refDestructuringErrors) {
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refDestructuringErrors);
    return this.finishNode(node, "SpreadElement")
  };

  pp$2.parseRestBinding = function() {
    var node = this.startNode();
    this.next();

    // RestElement inside of a function parameter must be an identifier
    if (this.options.ecmaVersion === 6 && this.type !== types.name)
      { this.unexpected(); }

    node.argument = this.parseBindingAtom();

    return this.finishNode(node, "RestElement")
  };

  // Parses lvalue (assignable) atom.

  pp$2.parseBindingAtom = function() {
    if (this.options.ecmaVersion >= 6) {
      switch (this.type) {
      case types.bracketL:
        var node = this.startNode();
        this.next();
        node.elements = this.parseBindingList(types.bracketR, true, true);
        return this.finishNode(node, "ArrayPattern")

      case types.braceL:
        return this.parseObj(true)
      }
    }
    return this.parseIdent()
  };

  pp$2.parseBindingList = function(close, allowEmpty, allowTrailingComma) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (first) { first = false; }
      else { this.expect(types.comma); }
      if (allowEmpty && this.type === types.comma) {
        elts.push(null);
      } else if (allowTrailingComma && this.afterTrailingComma(close)) {
        break
      } else if (this.type === types.ellipsis) {
        var rest = this.parseRestBinding();
        this.parseBindingListItem(rest);
        elts.push(rest);
        if (this.type === types.comma) { this.raise(this.start, "Comma is not permitted after the rest element"); }
        this.expect(close);
        break
      } else {
        var elem = this.parseMaybeDefault(this.start, this.startLoc);
        this.parseBindingListItem(elem);
        elts.push(elem);
      }
    }
    return elts
  };

  pp$2.parseBindingListItem = function(param) {
    return param
  };

  // Parses assignment pattern around given atom if possible.

  pp$2.parseMaybeDefault = function(startPos, startLoc, left) {
    left = left || this.parseBindingAtom();
    if (this.options.ecmaVersion < 6 || !this.eat(types.eq)) { return left }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern")
  };

  // Verify that a node is an lval — something that can be assigned
  // to.
  // bindingType can be either:
  // 'var' indicating that the lval creates a 'var' binding
  // 'let' indicating that the lval creates a lexical ('let' or 'const') binding
  // 'none' indicating that the binding should be checked for illegal identifiers, but not for duplicate references

  pp$2.checkLVal = function(expr, bindingType, checkClashes) {
    if ( bindingType === void 0 ) bindingType = BIND_NONE;

    switch (expr.type) {
    case "Identifier":
      if (bindingType === BIND_LEXICAL && expr.name === "let")
        { this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name"); }
      if (this.strict && this.reservedWordsStrictBind.test(expr.name))
        { this.raiseRecoverable(expr.start, (bindingType ? "Binding " : "Assigning to ") + expr.name + " in strict mode"); }
      if (checkClashes) {
        if (has(checkClashes, expr.name))
          { this.raiseRecoverable(expr.start, "Argument name clash"); }
        checkClashes[expr.name] = true;
      }
      if (bindingType !== BIND_NONE && bindingType !== BIND_OUTSIDE) { this.declareName(expr.name, bindingType, expr.start); }
      break

    case "ChainExpression":
      this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
      break

    case "MemberExpression":
      if (bindingType) { this.raiseRecoverable(expr.start, "Binding member expression"); }
      break

    case "ObjectPattern":
      for (var i = 0, list = expr.properties; i < list.length; i += 1)
        {
      var prop = list[i];

      this.checkLVal(prop, bindingType, checkClashes);
    }
      break

    case "Property":
      // AssignmentProperty has type === "Property"
      this.checkLVal(expr.value, bindingType, checkClashes);
      break

    case "ArrayPattern":
      for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
        var elem = list$1[i$1];

      if (elem) { this.checkLVal(elem, bindingType, checkClashes); }
      }
      break

    case "AssignmentPattern":
      this.checkLVal(expr.left, bindingType, checkClashes);
      break

    case "RestElement":
      this.checkLVal(expr.argument, bindingType, checkClashes);
      break

    case "ParenthesizedExpression":
      this.checkLVal(expr.expression, bindingType, checkClashes);
      break

    default:
      this.raise(expr.start, (bindingType ? "Binding" : "Assigning to") + " rvalue");
    }
  };

  // A recursive descent parser operates by defining functions for all

  var pp$3 = Parser.prototype;

  // Check if property name clashes with already added.
  // Object/class getters and setters are not allowed to clash —
  // either with each other or with an init property — and in
  // strict mode, init properties are also not allowed to be repeated.

  pp$3.checkPropClash = function(prop, propHash, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement")
      { return }
    if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand))
      { return }
    var key = prop.key;
    var name;
    switch (key.type) {
    case "Identifier": name = key.name; break
    case "Literal": name = String(key.value); break
    default: return
    }
    var kind = prop.kind;
    if (this.options.ecmaVersion >= 6) {
      if (name === "__proto__" && kind === "init") {
        if (propHash.proto) {
          if (refDestructuringErrors) {
            if (refDestructuringErrors.doubleProto < 0)
              { refDestructuringErrors.doubleProto = key.start; }
            // Backwards-compat kludge. Can be removed in version 6.0
          } else { this.raiseRecoverable(key.start, "Redefinition of __proto__ property"); }
        }
        propHash.proto = true;
      }
      return
    }
    name = "$" + name;
    var other = propHash[name];
    if (other) {
      var redefinition;
      if (kind === "init") {
        redefinition = this.strict && other.init || other.get || other.set;
      } else {
        redefinition = other.init || other[kind];
      }
      if (redefinition)
        { this.raiseRecoverable(key.start, "Redefinition of property"); }
    } else {
      other = propHash[name] = {
        init: false,
        get: false,
        set: false
      };
    }
    other[kind] = true;
  };

  // ### Expression parsing

  // These nest, from the most general expression type at the top to
  // 'atomic', nondivisible expression types at the bottom. Most of
  // the functions will simply let the function(s) below them parse,
  // and, *if* the syntactic construct they handle is present, wrap
  // the AST node that the inner parser gave them in another node.

  // Parse a full expression. The optional arguments are used to
  // forbid the `in` operator (in for loops initalization expressions)
  // and provide reference for storing '=' operator inside shorthand
  // property assignment in contexts where both object expression
  // and object pattern might appear (so it's possible to raise
  // delayed syntax error at correct position).

  pp$3.parseExpression = function(noIn, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeAssign(noIn, refDestructuringErrors);
    if (this.type === types.comma) {
      var node = this.startNodeAt(startPos, startLoc);
      node.expressions = [expr];
      while (this.eat(types.comma)) { node.expressions.push(this.parseMaybeAssign(noIn, refDestructuringErrors)); }
      return this.finishNode(node, "SequenceExpression")
    }
    return expr
  };

  // Parse an assignment expression. This includes applications of
  // operators like `+=`.

  pp$3.parseMaybeAssign = function(noIn, refDestructuringErrors, afterLeftParse) {
    if (this.isContextual("yield")) {
      if (this.inGenerator) { return this.parseYield(noIn) }
      // The tokenizer will assume an expression is allowed after
      // `yield`, but this isn't that kind of yield
      else { this.exprAllowed = false; }
    }

    var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1;
    if (refDestructuringErrors) {
      oldParenAssign = refDestructuringErrors.parenthesizedAssign;
      oldTrailingComma = refDestructuringErrors.trailingComma;
      refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
    } else {
      refDestructuringErrors = new DestructuringErrors;
      ownDestructuringErrors = true;
    }

    var startPos = this.start, startLoc = this.startLoc;
    if (this.type === types.parenL || this.type === types.name)
      { this.potentialArrowAt = this.start; }
    var left = this.parseMaybeConditional(noIn, refDestructuringErrors);
    if (afterLeftParse) { left = afterLeftParse.call(this, left, startPos, startLoc); }
    if (this.type.isAssign) {
      var node = this.startNodeAt(startPos, startLoc);
      node.operator = this.value;
      node.left = this.type === types.eq ? this.toAssignable(left, false, refDestructuringErrors) : left;
      if (!ownDestructuringErrors) {
        refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
      }
      if (refDestructuringErrors.shorthandAssign >= node.left.start)
        { refDestructuringErrors.shorthandAssign = -1; } // reset because shorthand default was used correctly
      this.checkLVal(left);
      this.next();
      node.right = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "AssignmentExpression")
    } else {
      if (ownDestructuringErrors) { this.checkExpressionErrors(refDestructuringErrors, true); }
    }
    if (oldParenAssign > -1) { refDestructuringErrors.parenthesizedAssign = oldParenAssign; }
    if (oldTrailingComma > -1) { refDestructuringErrors.trailingComma = oldTrailingComma; }
    return left
  };

  // Parse a ternary conditional (`?:`) operator.

  pp$3.parseMaybeConditional = function(noIn, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprOps(noIn, refDestructuringErrors);
    if (this.checkExpressionErrors(refDestructuringErrors)) { return expr }
    if (this.eat(types.question)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.test = expr;
      node.consequent = this.parseMaybeAssign();
      this.expect(types.colon);
      node.alternate = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "ConditionalExpression")
    }
    return expr
  };

  // Start the precedence parser.

  pp$3.parseExprOps = function(noIn, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeUnary(refDestructuringErrors, false);
    if (this.checkExpressionErrors(refDestructuringErrors)) { return expr }
    return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, noIn)
  };

  // Parse binary operators with the operator precedence parsing
  // algorithm. `left` is the left-hand side of the operator.
  // `minPrec` provides context that allows the function to stop and
  // defer further parser to one of its callers when it encounters an
  // operator that has a lower precedence than the set it is parsing.

  pp$3.parseExprOp = function(left, leftStartPos, leftStartLoc, minPrec, noIn) {
    var prec = this.type.binop;
    if (prec != null && (!noIn || this.type !== types._in)) {
      if (prec > minPrec) {
        var logical = this.type === types.logicalOR || this.type === types.logicalAND;
        var coalesce = this.type === types.coalesce;
        if (coalesce) {
          // Handle the precedence of `tt.coalesce` as equal to the range of logical expressions.
          // In other words, `node.right` shouldn't contain logical expressions in order to check the mixed error.
          prec = types.logicalAND.binop;
        }
        var op = this.value;
        this.next();
        var startPos = this.start, startLoc = this.startLoc;
        var right = this.parseExprOp(this.parseMaybeUnary(null, false), startPos, startLoc, prec, noIn);
        var node = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
        if ((logical && this.type === types.coalesce) || (coalesce && (this.type === types.logicalOR || this.type === types.logicalAND))) {
          this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
        }
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, noIn)
      }
    }
    return left
  };

  pp$3.buildBinary = function(startPos, startLoc, left, right, op, logical) {
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.operator = op;
    node.right = right;
    return this.finishNode(node, logical ? "LogicalExpression" : "BinaryExpression")
  };

  // Parse unary operators, both prefix and postfix.

  pp$3.parseMaybeUnary = function(refDestructuringErrors, sawUnary) {
    var startPos = this.start, startLoc = this.startLoc, expr;
    if (this.isContextual("await") && (this.inAsync || (!this.inFunction && this.options.allowAwaitOutsideFunction))) {
      expr = this.parseAwait();
      sawUnary = true;
    } else if (this.type.prefix) {
      var node = this.startNode(), update = this.type === types.incDec;
      node.operator = this.value;
      node.prefix = true;
      this.next();
      node.argument = this.parseMaybeUnary(null, true);
      this.checkExpressionErrors(refDestructuringErrors, true);
      if (update) { this.checkLVal(node.argument); }
      else if (this.strict && node.operator === "delete" &&
               node.argument.type === "Identifier")
        { this.raiseRecoverable(node.start, "Deleting local variable in strict mode"); }
      else { sawUnary = true; }
      expr = this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    } else {
      expr = this.parseExprSubscripts(refDestructuringErrors);
      if (this.checkExpressionErrors(refDestructuringErrors)) { return expr }
      while (this.type.postfix && !this.canInsertSemicolon()) {
        var node$1 = this.startNodeAt(startPos, startLoc);
        node$1.operator = this.value;
        node$1.prefix = false;
        node$1.argument = expr;
        this.checkLVal(expr);
        this.next();
        expr = this.finishNode(node$1, "UpdateExpression");
      }
    }

    if (!sawUnary && this.eat(types.starstar))
      { return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false), "**", false) }
    else
      { return expr }
  };

  // Parse call, dot, and `[]`-subscript expressions.

  pp$3.parseExprSubscripts = function(refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprAtom(refDestructuringErrors);
    if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")")
      { return expr }
    var result = this.parseSubscripts(expr, startPos, startLoc);
    if (refDestructuringErrors && result.type === "MemberExpression") {
      if (refDestructuringErrors.parenthesizedAssign >= result.start) { refDestructuringErrors.parenthesizedAssign = -1; }
      if (refDestructuringErrors.parenthesizedBind >= result.start) { refDestructuringErrors.parenthesizedBind = -1; }
    }
    return result
  };

  pp$3.parseSubscripts = function(base, startPos, startLoc, noCalls) {
    var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" &&
        this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 &&
        this.potentialArrowAt === base.start;
    var optionalChained = false;

    while (true) {
      var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained);

      if (element.optional) { optionalChained = true; }
      if (element === base || element.type === "ArrowFunctionExpression") {
        if (optionalChained) {
          var chainNode = this.startNodeAt(startPos, startLoc);
          chainNode.expression = element;
          element = this.finishNode(chainNode, "ChainExpression");
        }
        return element
      }

      base = element;
    }
  };

  pp$3.parseSubscript = function(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained) {
    var optionalSupported = this.options.ecmaVersion >= 11;
    var optional = optionalSupported && this.eat(types.questionDot);
    if (noCalls && optional) { this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions"); }

    var computed = this.eat(types.bracketL);
    if (computed || (optional && this.type !== types.parenL && this.type !== types.backQuote) || this.eat(types.dot)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.property = computed ? this.parseExpression() : this.parseIdent(this.options.allowReserved !== "never");
      node.computed = !!computed;
      if (computed) { this.expect(types.bracketR); }
      if (optionalSupported) {
        node.optional = optional;
      }
      base = this.finishNode(node, "MemberExpression");
    } else if (!noCalls && this.eat(types.parenL)) {
      var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
      this.yieldPos = 0;
      this.awaitPos = 0;
      this.awaitIdentPos = 0;
      var exprList = this.parseExprList(types.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
      if (maybeAsyncArrow && !optional && !this.canInsertSemicolon() && this.eat(types.arrow)) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        if (this.awaitIdentPos > 0)
          { this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function"); }
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        this.awaitIdentPos = oldAwaitIdentPos;
        return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true)
      }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;
      this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.callee = base;
      node$1.arguments = exprList;
      if (optionalSupported) {
        node$1.optional = optional;
      }
      base = this.finishNode(node$1, "CallExpression");
    } else if (this.type === types.backQuote) {
      if (optional || optionalChained) {
        this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
      }
      var node$2 = this.startNodeAt(startPos, startLoc);
      node$2.tag = base;
      node$2.quasi = this.parseTemplate({isTagged: true});
      base = this.finishNode(node$2, "TaggedTemplateExpression");
    }
    return base
  };

  // Parse an atomic expression — either a single token that is an
  // expression, an expression started by a keyword like `function` or
  // `new`, or an expression wrapped in punctuation like `()`, `[]`,
  // or `{}`.

  pp$3.parseExprAtom = function(refDestructuringErrors) {
    // If a division operator appears in an expression position, the
    // tokenizer got confused, and we force it to read a regexp instead.
    if (this.type === types.slash) { this.readRegexp(); }

    var node, canBeArrow = this.potentialArrowAt === this.start;
    switch (this.type) {
    case types._super:
      if (!this.allowSuper)
        { this.raise(this.start, "'super' keyword outside a method"); }
      node = this.startNode();
      this.next();
      if (this.type === types.parenL && !this.allowDirectSuper)
        { this.raise(node.start, "super() call outside constructor of a subclass"); }
      // The `super` keyword can appear at below:
      // SuperProperty:
      //     super [ Expression ]
      //     super . IdentifierName
      // SuperCall:
      //     super ( Arguments )
      if (this.type !== types.dot && this.type !== types.bracketL && this.type !== types.parenL)
        { this.unexpected(); }
      return this.finishNode(node, "Super")

    case types._this:
      node = this.startNode();
      this.next();
      return this.finishNode(node, "ThisExpression")

    case types.name:
      var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
      var id = this.parseIdent(false);
      if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types._function))
        { return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true) }
      if (canBeArrow && !this.canInsertSemicolon()) {
        if (this.eat(types.arrow))
          { return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false) }
        if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types.name && !containsEsc) {
          id = this.parseIdent(false);
          if (this.canInsertSemicolon() || !this.eat(types.arrow))
            { this.unexpected(); }
          return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true)
        }
      }
      return id

    case types.regexp:
      var value = this.value;
      node = this.parseLiteral(value.value);
      node.regex = {pattern: value.pattern, flags: value.flags};
      return node

    case types.num: case types.string:
      return this.parseLiteral(this.value)

    case types._null: case types._true: case types._false:
      node = this.startNode();
      node.value = this.type === types._null ? null : this.type === types._true;
      node.raw = this.type.keyword;
      this.next();
      return this.finishNode(node, "Literal")

    case types.parenL:
      var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow);
      if (refDestructuringErrors) {
        if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr))
          { refDestructuringErrors.parenthesizedAssign = start; }
        if (refDestructuringErrors.parenthesizedBind < 0)
          { refDestructuringErrors.parenthesizedBind = start; }
      }
      return expr

    case types.bracketL:
      node = this.startNode();
      this.next();
      node.elements = this.parseExprList(types.bracketR, true, true, refDestructuringErrors);
      return this.finishNode(node, "ArrayExpression")

    case types.braceL:
      return this.parseObj(false, refDestructuringErrors)

    case types._function:
      node = this.startNode();
      this.next();
      return this.parseFunction(node, 0)

    case types._class:
      return this.parseClass(this.startNode(), false)

    case types._new:
      return this.parseNew()

    case types.backQuote:
      return this.parseTemplate()

    case types._import:
      if (this.options.ecmaVersion >= 11) {
        return this.parseExprImport()
      } else {
        return this.unexpected()
      }

    default:
      this.unexpected();
    }
  };

  pp$3.parseExprImport = function() {
    var node = this.startNode();

    // Consume `import` as an identifier for `import.meta`.
    // Because `this.parseIdent(true)` doesn't check escape sequences, it needs the check of `this.containsEsc`.
    if (this.containsEsc) { this.raiseRecoverable(this.start, "Escape sequence in keyword import"); }
    var meta = this.parseIdent(true);

    switch (this.type) {
    case types.parenL:
      return this.parseDynamicImport(node)
    case types.dot:
      node.meta = meta;
      return this.parseImportMeta(node)
    default:
      this.unexpected();
    }
  };

  pp$3.parseDynamicImport = function(node) {
    this.next(); // skip `(`

    // Parse node.source.
    node.source = this.parseMaybeAssign();

    // Verify ending.
    if (!this.eat(types.parenR)) {
      var errorPos = this.start;
      if (this.eat(types.comma) && this.eat(types.parenR)) {
        this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
      } else {
        this.unexpected(errorPos);
      }
    }

    return this.finishNode(node, "ImportExpression")
  };

  pp$3.parseImportMeta = function(node) {
    this.next(); // skip `.`

    var containsEsc = this.containsEsc;
    node.property = this.parseIdent(true);

    if (node.property.name !== "meta")
      { this.raiseRecoverable(node.property.start, "The only valid meta property for import is 'import.meta'"); }
    if (containsEsc)
      { this.raiseRecoverable(node.start, "'import.meta' must not contain escaped characters"); }
    if (this.options.sourceType !== "module")
      { this.raiseRecoverable(node.start, "Cannot use 'import.meta' outside a module"); }

    return this.finishNode(node, "MetaProperty")
  };

  pp$3.parseLiteral = function(value) {
    var node = this.startNode();
    node.value = value;
    node.raw = this.input.slice(this.start, this.end);
    if (node.raw.charCodeAt(node.raw.length - 1) === 110) { node.bigint = node.raw.slice(0, -1).replace(/_/g, ""); }
    this.next();
    return this.finishNode(node, "Literal")
  };

  pp$3.parseParenExpression = function() {
    this.expect(types.parenL);
    var val = this.parseExpression();
    this.expect(types.parenR);
    return val
  };

  pp$3.parseParenAndDistinguishExpression = function(canBeArrow) {
    var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
    if (this.options.ecmaVersion >= 6) {
      this.next();

      var innerStartPos = this.start, innerStartLoc = this.startLoc;
      var exprList = [], first = true, lastIsComma = false;
      var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
      this.yieldPos = 0;
      this.awaitPos = 0;
      // Do not save awaitIdentPos to allow checking awaits nested in parameters
      while (this.type !== types.parenR) {
        first ? first = false : this.expect(types.comma);
        if (allowTrailingComma && this.afterTrailingComma(types.parenR, true)) {
          lastIsComma = true;
          break
        } else if (this.type === types.ellipsis) {
          spreadStart = this.start;
          exprList.push(this.parseParenItem(this.parseRestBinding()));
          if (this.type === types.comma) { this.raise(this.start, "Comma is not permitted after the rest element"); }
          break
        } else {
          exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
        }
      }
      var innerEndPos = this.start, innerEndLoc = this.startLoc;
      this.expect(types.parenR);

      if (canBeArrow && !this.canInsertSemicolon() && this.eat(types.arrow)) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        return this.parseParenArrowList(startPos, startLoc, exprList)
      }

      if (!exprList.length || lastIsComma) { this.unexpected(this.lastTokStart); }
      if (spreadStart) { this.unexpected(spreadStart); }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;

      if (exprList.length > 1) {
        val = this.startNodeAt(innerStartPos, innerStartLoc);
        val.expressions = exprList;
        this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
      } else {
        val = exprList[0];
      }
    } else {
      val = this.parseParenExpression();
    }

    if (this.options.preserveParens) {
      var par = this.startNodeAt(startPos, startLoc);
      par.expression = val;
      return this.finishNode(par, "ParenthesizedExpression")
    } else {
      return val
    }
  };

  pp$3.parseParenItem = function(item) {
    return item
  };

  pp$3.parseParenArrowList = function(startPos, startLoc, exprList) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList)
  };

  // New's precedence is slightly tricky. It must allow its argument to
  // be a `[]` or dot subscript expression, but not a call — at least,
  // not without wrapping it in parentheses. Thus, it uses the noCalls
  // argument to parseSubscripts to prevent it from consuming the
  // argument list.

  var empty$1 = [];

  pp$3.parseNew = function() {
    if (this.containsEsc) { this.raiseRecoverable(this.start, "Escape sequence in keyword new"); }
    var node = this.startNode();
    var meta = this.parseIdent(true);
    if (this.options.ecmaVersion >= 6 && this.eat(types.dot)) {
      node.meta = meta;
      var containsEsc = this.containsEsc;
      node.property = this.parseIdent(true);
      if (node.property.name !== "target")
        { this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'"); }
      if (containsEsc)
        { this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters"); }
      if (!this.inNonArrowFunction())
        { this.raiseRecoverable(node.start, "'new.target' can only be used in functions"); }
      return this.finishNode(node, "MetaProperty")
    }
    var startPos = this.start, startLoc = this.startLoc, isImport = this.type === types._import;
    node.callee = this.parseSubscripts(this.parseExprAtom(), startPos, startLoc, true);
    if (isImport && node.callee.type === "ImportExpression") {
      this.raise(startPos, "Cannot use new with import()");
    }
    if (this.eat(types.parenL)) { node.arguments = this.parseExprList(types.parenR, this.options.ecmaVersion >= 8, false); }
    else { node.arguments = empty$1; }
    return this.finishNode(node, "NewExpression")
  };

  // Parse template expression.

  pp$3.parseTemplateElement = function(ref) {
    var isTagged = ref.isTagged;

    var elem = this.startNode();
    if (this.type === types.invalidTemplate) {
      if (!isTagged) {
        this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
      }
      elem.value = {
        raw: this.value,
        cooked: null
      };
    } else {
      elem.value = {
        raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, "\n"),
        cooked: this.value
      };
    }
    this.next();
    elem.tail = this.type === types.backQuote;
    return this.finishNode(elem, "TemplateElement")
  };

  pp$3.parseTemplate = function(ref) {
    if ( ref === void 0 ) ref = {};
    var isTagged = ref.isTagged; if ( isTagged === void 0 ) isTagged = false;

    var node = this.startNode();
    this.next();
    node.expressions = [];
    var curElt = this.parseTemplateElement({isTagged: isTagged});
    node.quasis = [curElt];
    while (!curElt.tail) {
      if (this.type === types.eof) { this.raise(this.pos, "Unterminated template literal"); }
      this.expect(types.dollarBraceL);
      node.expressions.push(this.parseExpression());
      this.expect(types.braceR);
      node.quasis.push(curElt = this.parseTemplateElement({isTagged: isTagged}));
    }
    this.next();
    return this.finishNode(node, "TemplateLiteral")
  };

  pp$3.isAsyncProp = function(prop) {
    return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" &&
      (this.type === types.name || this.type === types.num || this.type === types.string || this.type === types.bracketL || this.type.keyword || (this.options.ecmaVersion >= 9 && this.type === types.star)) &&
      !lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  };

  // Parse an object literal or binding pattern.

  pp$3.parseObj = function(isPattern, refDestructuringErrors) {
    var node = this.startNode(), first = true, propHash = {};
    node.properties = [];
    this.next();
    while (!this.eat(types.braceR)) {
      if (!first) {
        this.expect(types.comma);
        if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types.braceR)) { break }
      } else { first = false; }

      var prop = this.parseProperty(isPattern, refDestructuringErrors);
      if (!isPattern) { this.checkPropClash(prop, propHash, refDestructuringErrors); }
      node.properties.push(prop);
    }
    return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression")
  };

  pp$3.parseProperty = function(isPattern, refDestructuringErrors) {
    var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
    if (this.options.ecmaVersion >= 9 && this.eat(types.ellipsis)) {
      if (isPattern) {
        prop.argument = this.parseIdent(false);
        if (this.type === types.comma) {
          this.raise(this.start, "Comma is not permitted after the rest element");
        }
        return this.finishNode(prop, "RestElement")
      }
      // To disallow parenthesized identifier via `this.toAssignable()`.
      if (this.type === types.parenL && refDestructuringErrors) {
        if (refDestructuringErrors.parenthesizedAssign < 0) {
          refDestructuringErrors.parenthesizedAssign = this.start;
        }
        if (refDestructuringErrors.parenthesizedBind < 0) {
          refDestructuringErrors.parenthesizedBind = this.start;
        }
      }
      // Parse argument.
      prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
      // To disallow trailing comma via `this.toAssignable()`.
      if (this.type === types.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) {
        refDestructuringErrors.trailingComma = this.start;
      }
      // Finish
      return this.finishNode(prop, "SpreadElement")
    }
    if (this.options.ecmaVersion >= 6) {
      prop.method = false;
      prop.shorthand = false;
      if (isPattern || refDestructuringErrors) {
        startPos = this.start;
        startLoc = this.startLoc;
      }
      if (!isPattern)
        { isGenerator = this.eat(types.star); }
    }
    var containsEsc = this.containsEsc;
    this.parsePropertyName(prop);
    if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
      isAsync = true;
      isGenerator = this.options.ecmaVersion >= 9 && this.eat(types.star);
      this.parsePropertyName(prop, refDestructuringErrors);
    } else {
      isAsync = false;
    }
    this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
    return this.finishNode(prop, "Property")
  };

  pp$3.parsePropertyValue = function(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
    if ((isGenerator || isAsync) && this.type === types.colon)
      { this.unexpected(); }

    if (this.eat(types.colon)) {
      prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
      prop.kind = "init";
    } else if (this.options.ecmaVersion >= 6 && this.type === types.parenL) {
      if (isPattern) { this.unexpected(); }
      prop.kind = "init";
      prop.method = true;
      prop.value = this.parseMethod(isGenerator, isAsync);
    } else if (!isPattern && !containsEsc &&
               this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" &&
               (prop.key.name === "get" || prop.key.name === "set") &&
               (this.type !== types.comma && this.type !== types.braceR && this.type !== types.eq)) {
      if (isGenerator || isAsync) { this.unexpected(); }
      prop.kind = prop.key.name;
      this.parsePropertyName(prop);
      prop.value = this.parseMethod(false);
      var paramCount = prop.kind === "get" ? 0 : 1;
      if (prop.value.params.length !== paramCount) {
        var start = prop.value.start;
        if (prop.kind === "get")
          { this.raiseRecoverable(start, "getter should have no params"); }
        else
          { this.raiseRecoverable(start, "setter should have exactly one param"); }
      } else {
        if (prop.kind === "set" && prop.value.params[0].type === "RestElement")
          { this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params"); }
      }
    } else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
      if (isGenerator || isAsync) { this.unexpected(); }
      this.checkUnreserved(prop.key);
      if (prop.key.name === "await" && !this.awaitIdentPos)
        { this.awaitIdentPos = startPos; }
      prop.kind = "init";
      if (isPattern) {
        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key);
      } else if (this.type === types.eq && refDestructuringErrors) {
        if (refDestructuringErrors.shorthandAssign < 0)
          { refDestructuringErrors.shorthandAssign = this.start; }
        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key);
      } else {
        prop.value = prop.key;
      }
      prop.shorthand = true;
    } else { this.unexpected(); }
  };

  pp$3.parsePropertyName = function(prop) {
    if (this.options.ecmaVersion >= 6) {
      if (this.eat(types.bracketL)) {
        prop.computed = true;
        prop.key = this.parseMaybeAssign();
        this.expect(types.bracketR);
        return prop.key
      } else {
        prop.computed = false;
      }
    }
    return prop.key = this.type === types.num || this.type === types.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never")
  };

  // Initialize empty function node.

  pp$3.initFunction = function(node) {
    node.id = null;
    if (this.options.ecmaVersion >= 6) { node.generator = node.expression = false; }
    if (this.options.ecmaVersion >= 8) { node.async = false; }
  };

  // Parse object or class method.

  pp$3.parseMethod = function(isGenerator, isAsync, allowDirectSuper) {
    var node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;

    this.initFunction(node);
    if (this.options.ecmaVersion >= 6)
      { node.generator = isGenerator; }
    if (this.options.ecmaVersion >= 8)
      { node.async = !!isAsync; }

    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(isAsync, node.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));

    this.expect(types.parenL);
    node.params = this.parseBindingList(types.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
    this.parseFunctionBody(node, false, true);

    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "FunctionExpression")
  };

  // Parse arrow function expression with given parameters.

  pp$3.parseArrowExpression = function(node, params, isAsync) {
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;

    this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
    this.initFunction(node);
    if (this.options.ecmaVersion >= 8) { node.async = !!isAsync; }

    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;

    node.params = this.toAssignableList(params, true);
    this.parseFunctionBody(node, true, false);

    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "ArrowFunctionExpression")
  };

  // Parse function body and check parameters.

  pp$3.parseFunctionBody = function(node, isArrowFunction, isMethod) {
    var isExpression = isArrowFunction && this.type !== types.braceL;
    var oldStrict = this.strict, useStrict = false;

    if (isExpression) {
      node.body = this.parseMaybeAssign();
      node.expression = true;
      this.checkParams(node, false);
    } else {
      var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params);
      if (!oldStrict || nonSimple) {
        useStrict = this.strictDirective(this.end);
        // If this is a strict mode function, verify that argument names
        // are not repeated, and it does not try to bind the words `eval`
        // or `arguments`.
        if (useStrict && nonSimple)
          { this.raiseRecoverable(node.start, "Illegal 'use strict' directive in function with non-simple parameter list"); }
      }
      // Start a new scope with regard to labels and the `inFunction`
      // flag (restore them to their old value afterwards).
      var oldLabels = this.labels;
      this.labels = [];
      if (useStrict) { this.strict = true; }

      // Add the params to varDeclaredNames to ensure that an error is thrown
      // if a let/const declaration in the function clashes with one of the params.
      this.checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node.params));
      // Ensure the function name isn't a forbidden identifier in strict mode, e.g. 'eval'
      if (this.strict && node.id) { this.checkLVal(node.id, BIND_OUTSIDE); }
      node.body = this.parseBlock(false, undefined, useStrict && !oldStrict);
      node.expression = false;
      this.adaptDirectivePrologue(node.body.body);
      this.labels = oldLabels;
    }
    this.exitScope();
  };

  pp$3.isSimpleParamList = function(params) {
    for (var i = 0, list = params; i < list.length; i += 1)
      {
      var param = list[i];

      if (param.type !== "Identifier") { return false
    } }
    return true
  };

  // Checks function params for various disallowed patterns such as using "eval"
  // or "arguments" and duplicate parameters.

  pp$3.checkParams = function(node, allowDuplicates) {
    var nameHash = {};
    for (var i = 0, list = node.params; i < list.length; i += 1)
      {
      var param = list[i];

      this.checkLVal(param, BIND_VAR, allowDuplicates ? null : nameHash);
    }
  };

  // Parses a comma-separated list of expressions, and returns them as
  // an array. `close` is the token type that ends the list, and
  // `allowEmpty` can be turned on to allow subsequent commas with
  // nothing in between them to be parsed as `null` (which is needed
  // for array literals).

  pp$3.parseExprList = function(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (!first) {
        this.expect(types.comma);
        if (allowTrailingComma && this.afterTrailingComma(close)) { break }
      } else { first = false; }

      var elt = (void 0);
      if (allowEmpty && this.type === types.comma)
        { elt = null; }
      else if (this.type === types.ellipsis) {
        elt = this.parseSpread(refDestructuringErrors);
        if (refDestructuringErrors && this.type === types.comma && refDestructuringErrors.trailingComma < 0)
          { refDestructuringErrors.trailingComma = this.start; }
      } else {
        elt = this.parseMaybeAssign(false, refDestructuringErrors);
      }
      elts.push(elt);
    }
    return elts
  };

  pp$3.checkUnreserved = function(ref) {
    var start = ref.start;
    var end = ref.end;
    var name = ref.name;

    if (this.inGenerator && name === "yield")
      { this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator"); }
    if (this.inAsync && name === "await")
      { this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function"); }
    if (this.keywords.test(name))
      { this.raise(start, ("Unexpected keyword '" + name + "'")); }
    if (this.options.ecmaVersion < 6 &&
      this.input.slice(start, end).indexOf("\\") !== -1) { return }
    var re = this.strict ? this.reservedWordsStrict : this.reservedWords;
    if (re.test(name)) {
      if (!this.inAsync && name === "await")
        { this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function"); }
      this.raiseRecoverable(start, ("The keyword '" + name + "' is reserved"));
    }
  };

  // Parse the next token as an identifier. If `liberal` is true (used
  // when parsing properties), it will also convert keywords into
  // identifiers.

  pp$3.parseIdent = function(liberal, isBinding) {
    var node = this.startNode();
    if (this.type === types.name) {
      node.name = this.value;
    } else if (this.type.keyword) {
      node.name = this.type.keyword;

      // To fix https://github.com/acornjs/acorn/issues/575
      // `class` and `function` keywords push new context into this.context.
      // But there is no chance to pop the context if the keyword is consumed as an identifier such as a property name.
      // If the previous token is a dot, this does not apply because the context-managing code already ignored the keyword
      if ((node.name === "class" || node.name === "function") &&
          (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) {
        this.context.pop();
      }
    } else {
      this.unexpected();
    }
    this.next(!!liberal);
    this.finishNode(node, "Identifier");
    if (!liberal) {
      this.checkUnreserved(node);
      if (node.name === "await" && !this.awaitIdentPos)
        { this.awaitIdentPos = node.start; }
    }
    return node
  };

  // Parses yield expression inside generator.

  pp$3.parseYield = function(noIn) {
    if (!this.yieldPos) { this.yieldPos = this.start; }

    var node = this.startNode();
    this.next();
    if (this.type === types.semi || this.canInsertSemicolon() || (this.type !== types.star && !this.type.startsExpr)) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = this.eat(types.star);
      node.argument = this.parseMaybeAssign(noIn);
    }
    return this.finishNode(node, "YieldExpression")
  };

  pp$3.parseAwait = function() {
    if (!this.awaitPos) { this.awaitPos = this.start; }

    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeUnary(null, false);
    return this.finishNode(node, "AwaitExpression")
  };

  var pp$4 = Parser.prototype;

  // This function is used to raise exceptions on parse errors. It
  // takes an offset integer (into the current `input`) to indicate
  // the location of the error, attaches the position to the end
  // of the error message, and then raises a `SyntaxError` with that
  // message.

  pp$4.raise = function(pos, message) {
    var loc = getLineInfo(this.input, pos);
    message += " (" + loc.line + ":" + loc.column + ")";
    var err = new SyntaxError(message);
    err.pos = pos; err.loc = loc; err.raisedAt = this.pos;
    throw err
  };

  pp$4.raiseRecoverable = pp$4.raise;

  pp$4.curPosition = function() {
    if (this.options.locations) {
      return new Position(this.curLine, this.pos - this.lineStart)
    }
  };

  var pp$5 = Parser.prototype;

  var Scope = function Scope(flags) {
    this.flags = flags;
    // A list of var-declared names in the current lexical scope
    this.var = [];
    // A list of lexically-declared names in the current lexical scope
    this.lexical = [];
    // A list of lexically-declared FunctionDeclaration names in the current lexical scope
    this.functions = [];
  };

  // The functions in this module keep track of declared variables in the current scope in order to detect duplicate variable names.

  pp$5.enterScope = function(flags) {
    this.scopeStack.push(new Scope(flags));
  };

  pp$5.exitScope = function() {
    this.scopeStack.pop();
  };

  // The spec says:
  // > At the top level of a function, or script, function declarations are
  // > treated like var declarations rather than like lexical declarations.
  pp$5.treatFunctionsAsVarInScope = function(scope) {
    return (scope.flags & SCOPE_FUNCTION) || !this.inModule && (scope.flags & SCOPE_TOP)
  };

  pp$5.declareName = function(name, bindingType, pos) {
    var redeclared = false;
    if (bindingType === BIND_LEXICAL) {
      var scope = this.currentScope();
      redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
      scope.lexical.push(name);
      if (this.inModule && (scope.flags & SCOPE_TOP))
        { delete this.undefinedExports[name]; }
    } else if (bindingType === BIND_SIMPLE_CATCH) {
      var scope$1 = this.currentScope();
      scope$1.lexical.push(name);
    } else if (bindingType === BIND_FUNCTION) {
      var scope$2 = this.currentScope();
      if (this.treatFunctionsAsVar)
        { redeclared = scope$2.lexical.indexOf(name) > -1; }
      else
        { redeclared = scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1; }
      scope$2.functions.push(name);
    } else {
      for (var i = this.scopeStack.length - 1; i >= 0; --i) {
        var scope$3 = this.scopeStack[i];
        if (scope$3.lexical.indexOf(name) > -1 && !((scope$3.flags & SCOPE_SIMPLE_CATCH) && scope$3.lexical[0] === name) ||
            !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name) > -1) {
          redeclared = true;
          break
        }
        scope$3.var.push(name);
        if (this.inModule && (scope$3.flags & SCOPE_TOP))
          { delete this.undefinedExports[name]; }
        if (scope$3.flags & SCOPE_VAR) { break }
      }
    }
    if (redeclared) { this.raiseRecoverable(pos, ("Identifier '" + name + "' has already been declared")); }
  };

  pp$5.checkLocalExport = function(id) {
    // scope.functions must be empty as Module code is always strict.
    if (this.scopeStack[0].lexical.indexOf(id.name) === -1 &&
        this.scopeStack[0].var.indexOf(id.name) === -1) {
      this.undefinedExports[id.name] = id;
    }
  };

  pp$5.currentScope = function() {
    return this.scopeStack[this.scopeStack.length - 1]
  };

  pp$5.currentVarScope = function() {
    for (var i = this.scopeStack.length - 1;; i--) {
      var scope = this.scopeStack[i];
      if (scope.flags & SCOPE_VAR) { return scope }
    }
  };

  // Could be useful for `this`, `new.target`, `super()`, `super.property`, and `super[property]`.
  pp$5.currentThisScope = function() {
    for (var i = this.scopeStack.length - 1;; i--) {
      var scope = this.scopeStack[i];
      if (scope.flags & SCOPE_VAR && !(scope.flags & SCOPE_ARROW)) { return scope }
    }
  };

  var Node = function Node(parser, pos, loc) {
    this.type = "";
    this.start = pos;
    this.end = 0;
    if (parser.options.locations)
      { this.loc = new SourceLocation(parser, loc); }
    if (parser.options.directSourceFile)
      { this.sourceFile = parser.options.directSourceFile; }
    if (parser.options.ranges)
      { this.range = [pos, 0]; }
  };

  // Start an AST node, attaching a start offset.

  var pp$6 = Parser.prototype;

  pp$6.startNode = function() {
    return new Node(this, this.start, this.startLoc)
  };

  pp$6.startNodeAt = function(pos, loc) {
    return new Node(this, pos, loc)
  };

  // Finish an AST node, adding `type` and `end` properties.

  function finishNodeAt(node, type, pos, loc) {
    node.type = type;
    node.end = pos;
    if (this.options.locations)
      { node.loc.end = loc; }
    if (this.options.ranges)
      { node.range[1] = pos; }
    return node
  }

  pp$6.finishNode = function(node, type) {
    return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc)
  };

  // Finish node at given position

  pp$6.finishNodeAt = function(node, type, pos, loc) {
    return finishNodeAt.call(this, node, type, pos, loc)
  };

  // The algorithm used to determine whether a regexp can appear at a

  var TokContext = function TokContext(token, isExpr, preserveSpace, override, generator) {
    this.token = token;
    this.isExpr = !!isExpr;
    this.preserveSpace = !!preserveSpace;
    this.override = override;
    this.generator = !!generator;
  };

  var types$1 = {
    b_stat: new TokContext("{", false),
    b_expr: new TokContext("{", true),
    b_tmpl: new TokContext("${", false),
    p_stat: new TokContext("(", false),
    p_expr: new TokContext("(", true),
    q_tmpl: new TokContext("`", true, true, function (p) { return p.tryReadTemplateToken(); }),
    f_stat: new TokContext("function", false),
    f_expr: new TokContext("function", true),
    f_expr_gen: new TokContext("function", true, false, null, true),
    f_gen: new TokContext("function", false, false, null, true)
  };

  var pp$7 = Parser.prototype;

  pp$7.initialContext = function() {
    return [types$1.b_stat]
  };

  pp$7.braceIsBlock = function(prevType) {
    var parent = this.curContext();
    if (parent === types$1.f_expr || parent === types$1.f_stat)
      { return true }
    if (prevType === types.colon && (parent === types$1.b_stat || parent === types$1.b_expr))
      { return !parent.isExpr }

    // The check for `tt.name && exprAllowed` detects whether we are
    // after a `yield` or `of` construct. See the `updateContext` for
    // `tt.name`.
    if (prevType === types._return || prevType === types.name && this.exprAllowed)
      { return lineBreak.test(this.input.slice(this.lastTokEnd, this.start)) }
    if (prevType === types._else || prevType === types.semi || prevType === types.eof || prevType === types.parenR || prevType === types.arrow)
      { return true }
    if (prevType === types.braceL)
      { return parent === types$1.b_stat }
    if (prevType === types._var || prevType === types._const || prevType === types.name)
      { return false }
    return !this.exprAllowed
  };

  pp$7.inGeneratorContext = function() {
    for (var i = this.context.length - 1; i >= 1; i--) {
      var context = this.context[i];
      if (context.token === "function")
        { return context.generator }
    }
    return false
  };

  pp$7.updateContext = function(prevType) {
    var update, type = this.type;
    if (type.keyword && prevType === types.dot)
      { this.exprAllowed = false; }
    else if (update = type.updateContext)
      { update.call(this, prevType); }
    else
      { this.exprAllowed = type.beforeExpr; }
  };

  // Token-specific context update code

  types.parenR.updateContext = types.braceR.updateContext = function() {
    if (this.context.length === 1) {
      this.exprAllowed = true;
      return
    }
    var out = this.context.pop();
    if (out === types$1.b_stat && this.curContext().token === "function") {
      out = this.context.pop();
    }
    this.exprAllowed = !out.isExpr;
  };

  types.braceL.updateContext = function(prevType) {
    this.context.push(this.braceIsBlock(prevType) ? types$1.b_stat : types$1.b_expr);
    this.exprAllowed = true;
  };

  types.dollarBraceL.updateContext = function() {
    this.context.push(types$1.b_tmpl);
    this.exprAllowed = true;
  };

  types.parenL.updateContext = function(prevType) {
    var statementParens = prevType === types._if || prevType === types._for || prevType === types._with || prevType === types._while;
    this.context.push(statementParens ? types$1.p_stat : types$1.p_expr);
    this.exprAllowed = true;
  };

  types.incDec.updateContext = function() {
    // tokExprAllowed stays unchanged
  };

  types._function.updateContext = types._class.updateContext = function(prevType) {
    if (prevType.beforeExpr && prevType !== types.semi && prevType !== types._else &&
        !(prevType === types._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) &&
        !((prevType === types.colon || prevType === types.braceL) && this.curContext() === types$1.b_stat))
      { this.context.push(types$1.f_expr); }
    else
      { this.context.push(types$1.f_stat); }
    this.exprAllowed = false;
  };

  types.backQuote.updateContext = function() {
    if (this.curContext() === types$1.q_tmpl)
      { this.context.pop(); }
    else
      { this.context.push(types$1.q_tmpl); }
    this.exprAllowed = false;
  };

  types.star.updateContext = function(prevType) {
    if (prevType === types._function) {
      var index = this.context.length - 1;
      if (this.context[index] === types$1.f_expr)
        { this.context[index] = types$1.f_expr_gen; }
      else
        { this.context[index] = types$1.f_gen; }
    }
    this.exprAllowed = true;
  };

  types.name.updateContext = function(prevType) {
    var allowed = false;
    if (this.options.ecmaVersion >= 6 && prevType !== types.dot) {
      if (this.value === "of" && !this.exprAllowed ||
          this.value === "yield" && this.inGeneratorContext())
        { allowed = true; }
    }
    this.exprAllowed = allowed;
  };

  // This file contains Unicode properties extracted from the ECMAScript
  // specification. The lists are extracted like so:
  // $$('#table-binary-unicode-properties > figure > table > tbody > tr > td:nth-child(1) code').map(el => el.innerText)

  // #table-binary-unicode-properties
  var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
  var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
  var ecma11BinaryProperties = ecma10BinaryProperties;
  var unicodeBinaryProperties = {
    9: ecma9BinaryProperties,
    10: ecma10BinaryProperties,
    11: ecma11BinaryProperties
  };

  // #table-unicode-general-category-values
  var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";

  // #table-unicode-script-values
  var ecma9ScriptValues = "Adlam Adlm Ahom Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
  var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
  var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
  var unicodeScriptValues = {
    9: ecma9ScriptValues,
    10: ecma10ScriptValues,
    11: ecma11ScriptValues
  };

  var data = {};
  function buildUnicodeData(ecmaVersion) {
    var d = data[ecmaVersion] = {
      binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion] + " " + unicodeGeneralCategoryValues),
      nonBinary: {
        General_Category: wordsRegexp(unicodeGeneralCategoryValues),
        Script: wordsRegexp(unicodeScriptValues[ecmaVersion])
      }
    };
    d.nonBinary.Script_Extensions = d.nonBinary.Script;

    d.nonBinary.gc = d.nonBinary.General_Category;
    d.nonBinary.sc = d.nonBinary.Script;
    d.nonBinary.scx = d.nonBinary.Script_Extensions;
  }
  buildUnicodeData(9);
  buildUnicodeData(10);
  buildUnicodeData(11);

  var pp$8 = Parser.prototype;

  var RegExpValidationState = function RegExpValidationState(parser) {
    this.parser = parser;
    this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "");
    this.unicodeProperties = data[parser.options.ecmaVersion >= 11 ? 11 : parser.options.ecmaVersion];
    this.source = "";
    this.flags = "";
    this.start = 0;
    this.switchU = false;
    this.switchN = false;
    this.pos = 0;
    this.lastIntValue = 0;
    this.lastStringValue = "";
    this.lastAssertionIsQuantifiable = false;
    this.numCapturingParens = 0;
    this.maxBackReference = 0;
    this.groupNames = [];
    this.backReferenceNames = [];
  };

  RegExpValidationState.prototype.reset = function reset (start, pattern, flags) {
    var unicode = flags.indexOf("u") !== -1;
    this.start = start | 0;
    this.source = pattern + "";
    this.flags = flags;
    this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
    this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
  };

  RegExpValidationState.prototype.raise = function raise (message) {
    this.parser.raiseRecoverable(this.start, ("Invalid regular expression: /" + (this.source) + "/: " + message));
  };

  // If u flag is given, this returns the code point at the index (it combines a surrogate pair).
  // Otherwise, this returns the code unit of the index (can be a part of a surrogate pair).
  RegExpValidationState.prototype.at = function at (i, forceU) {
      if ( forceU === void 0 ) forceU = false;

    var s = this.source;
    var l = s.length;
    if (i >= l) {
      return -1
    }
    var c = s.charCodeAt(i);
    if (!(forceU || this.switchU) || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l) {
      return c
    }
    var next = s.charCodeAt(i + 1);
    return next >= 0xDC00 && next <= 0xDFFF ? (c << 10) + next - 0x35FDC00 : c
  };

  RegExpValidationState.prototype.nextIndex = function nextIndex (i, forceU) {
      if ( forceU === void 0 ) forceU = false;

    var s = this.source;
    var l = s.length;
    if (i >= l) {
      return l
    }
    var c = s.charCodeAt(i), next;
    if (!(forceU || this.switchU) || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l ||
        (next = s.charCodeAt(i + 1)) < 0xDC00 || next > 0xDFFF) {
      return i + 1
    }
    return i + 2
  };

  RegExpValidationState.prototype.current = function current (forceU) {
      if ( forceU === void 0 ) forceU = false;

    return this.at(this.pos, forceU)
  };

  RegExpValidationState.prototype.lookahead = function lookahead (forceU) {
      if ( forceU === void 0 ) forceU = false;

    return this.at(this.nextIndex(this.pos, forceU), forceU)
  };

  RegExpValidationState.prototype.advance = function advance (forceU) {
      if ( forceU === void 0 ) forceU = false;

    this.pos = this.nextIndex(this.pos, forceU);
  };

  RegExpValidationState.prototype.eat = function eat (ch, forceU) {
      if ( forceU === void 0 ) forceU = false;

    if (this.current(forceU) === ch) {
      this.advance(forceU);
      return true
    }
    return false
  };

  function codePointToString(ch) {
    if (ch <= 0xFFFF) { return String.fromCharCode(ch) }
    ch -= 0x10000;
    return String.fromCharCode((ch >> 10) + 0xD800, (ch & 0x03FF) + 0xDC00)
  }

  /**
   * Validate the flags part of a given RegExpLiteral.
   *
   * @param {RegExpValidationState} state The state to validate RegExp.
   * @returns {void}
   */
  pp$8.validateRegExpFlags = function(state) {
    var validFlags = state.validFlags;
    var flags = state.flags;

    for (var i = 0; i < flags.length; i++) {
      var flag = flags.charAt(i);
      if (validFlags.indexOf(flag) === -1) {
        this.raise(state.start, "Invalid regular expression flag");
      }
      if (flags.indexOf(flag, i + 1) > -1) {
        this.raise(state.start, "Duplicate regular expression flag");
      }
    }
  };

  /**
   * Validate the pattern part of a given RegExpLiteral.
   *
   * @param {RegExpValidationState} state The state to validate RegExp.
   * @returns {void}
   */
  pp$8.validateRegExpPattern = function(state) {
    this.regexp_pattern(state);

    // The goal symbol for the parse is |Pattern[~U, ~N]|. If the result of
    // parsing contains a |GroupName|, reparse with the goal symbol
    // |Pattern[~U, +N]| and use this result instead. Throw a *SyntaxError*
    // exception if _P_ did not conform to the grammar, if any elements of _P_
    // were not matched by the parse, or if any Early Error conditions exist.
    if (!state.switchN && this.options.ecmaVersion >= 9 && state.groupNames.length > 0) {
      state.switchN = true;
      this.regexp_pattern(state);
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Pattern
  pp$8.regexp_pattern = function(state) {
    state.pos = 0;
    state.lastIntValue = 0;
    state.lastStringValue = "";
    state.lastAssertionIsQuantifiable = false;
    state.numCapturingParens = 0;
    state.maxBackReference = 0;
    state.groupNames.length = 0;
    state.backReferenceNames.length = 0;

    this.regexp_disjunction(state);

    if (state.pos !== state.source.length) {
      // Make the same messages as V8.
      if (state.eat(0x29 /* ) */)) {
        state.raise("Unmatched ')'");
      }
      if (state.eat(0x5D /* ] */) || state.eat(0x7D /* } */)) {
        state.raise("Lone quantifier brackets");
      }
    }
    if (state.maxBackReference > state.numCapturingParens) {
      state.raise("Invalid escape");
    }
    for (var i = 0, list = state.backReferenceNames; i < list.length; i += 1) {
      var name = list[i];

      if (state.groupNames.indexOf(name) === -1) {
        state.raise("Invalid named capture referenced");
      }
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Disjunction
  pp$8.regexp_disjunction = function(state) {
    this.regexp_alternative(state);
    while (state.eat(0x7C /* | */)) {
      this.regexp_alternative(state);
    }

    // Make the same message as V8.
    if (this.regexp_eatQuantifier(state, true)) {
      state.raise("Nothing to repeat");
    }
    if (state.eat(0x7B /* { */)) {
      state.raise("Lone quantifier brackets");
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Alternative
  pp$8.regexp_alternative = function(state) {
    while (state.pos < state.source.length && this.regexp_eatTerm(state))
      { }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-Term
  pp$8.regexp_eatTerm = function(state) {
    if (this.regexp_eatAssertion(state)) {
      // Handle `QuantifiableAssertion Quantifier` alternative.
      // `state.lastAssertionIsQuantifiable` is true if the last eaten Assertion
      // is a QuantifiableAssertion.
      if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
        // Make the same message as V8.
        if (state.switchU) {
          state.raise("Invalid quantifier");
        }
      }
      return true
    }

    if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
      this.regexp_eatQuantifier(state);
      return true
    }

    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-Assertion
  pp$8.regexp_eatAssertion = function(state) {
    var start = state.pos;
    state.lastAssertionIsQuantifiable = false;

    // ^, $
    if (state.eat(0x5E /* ^ */) || state.eat(0x24 /* $ */)) {
      return true
    }

    // \b \B
    if (state.eat(0x5C /* \ */)) {
      if (state.eat(0x42 /* B */) || state.eat(0x62 /* b */)) {
        return true
      }
      state.pos = start;
    }

    // Lookahead / Lookbehind
    if (state.eat(0x28 /* ( */) && state.eat(0x3F /* ? */)) {
      var lookbehind = false;
      if (this.options.ecmaVersion >= 9) {
        lookbehind = state.eat(0x3C /* < */);
      }
      if (state.eat(0x3D /* = */) || state.eat(0x21 /* ! */)) {
        this.regexp_disjunction(state);
        if (!state.eat(0x29 /* ) */)) {
          state.raise("Unterminated group");
        }
        state.lastAssertionIsQuantifiable = !lookbehind;
        return true
      }
    }

    state.pos = start;
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Quantifier
  pp$8.regexp_eatQuantifier = function(state, noError) {
    if ( noError === void 0 ) noError = false;

    if (this.regexp_eatQuantifierPrefix(state, noError)) {
      state.eat(0x3F /* ? */);
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-QuantifierPrefix
  pp$8.regexp_eatQuantifierPrefix = function(state, noError) {
    return (
      state.eat(0x2A /* * */) ||
      state.eat(0x2B /* + */) ||
      state.eat(0x3F /* ? */) ||
      this.regexp_eatBracedQuantifier(state, noError)
    )
  };
  pp$8.regexp_eatBracedQuantifier = function(state, noError) {
    var start = state.pos;
    if (state.eat(0x7B /* { */)) {
      var min = 0, max = -1;
      if (this.regexp_eatDecimalDigits(state)) {
        min = state.lastIntValue;
        if (state.eat(0x2C /* , */) && this.regexp_eatDecimalDigits(state)) {
          max = state.lastIntValue;
        }
        if (state.eat(0x7D /* } */)) {
          // SyntaxError in https://www.ecma-international.org/ecma-262/8.0/#sec-term
          if (max !== -1 && max < min && !noError) {
            state.raise("numbers out of order in {} quantifier");
          }
          return true
        }
      }
      if (state.switchU && !noError) {
        state.raise("Incomplete quantifier");
      }
      state.pos = start;
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Atom
  pp$8.regexp_eatAtom = function(state) {
    return (
      this.regexp_eatPatternCharacters(state) ||
      state.eat(0x2E /* . */) ||
      this.regexp_eatReverseSolidusAtomEscape(state) ||
      this.regexp_eatCharacterClass(state) ||
      this.regexp_eatUncapturingGroup(state) ||
      this.regexp_eatCapturingGroup(state)
    )
  };
  pp$8.regexp_eatReverseSolidusAtomEscape = function(state) {
    var start = state.pos;
    if (state.eat(0x5C /* \ */)) {
      if (this.regexp_eatAtomEscape(state)) {
        return true
      }
      state.pos = start;
    }
    return false
  };
  pp$8.regexp_eatUncapturingGroup = function(state) {
    var start = state.pos;
    if (state.eat(0x28 /* ( */)) {
      if (state.eat(0x3F /* ? */) && state.eat(0x3A /* : */)) {
        this.regexp_disjunction(state);
        if (state.eat(0x29 /* ) */)) {
          return true
        }
        state.raise("Unterminated group");
      }
      state.pos = start;
    }
    return false
  };
  pp$8.regexp_eatCapturingGroup = function(state) {
    if (state.eat(0x28 /* ( */)) {
      if (this.options.ecmaVersion >= 9) {
        this.regexp_groupSpecifier(state);
      } else if (state.current() === 0x3F /* ? */) {
        state.raise("Invalid group");
      }
      this.regexp_disjunction(state);
      if (state.eat(0x29 /* ) */)) {
        state.numCapturingParens += 1;
        return true
      }
      state.raise("Unterminated group");
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ExtendedAtom
  pp$8.regexp_eatExtendedAtom = function(state) {
    return (
      state.eat(0x2E /* . */) ||
      this.regexp_eatReverseSolidusAtomEscape(state) ||
      this.regexp_eatCharacterClass(state) ||
      this.regexp_eatUncapturingGroup(state) ||
      this.regexp_eatCapturingGroup(state) ||
      this.regexp_eatInvalidBracedQuantifier(state) ||
      this.regexp_eatExtendedPatternCharacter(state)
    )
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-InvalidBracedQuantifier
  pp$8.regexp_eatInvalidBracedQuantifier = function(state) {
    if (this.regexp_eatBracedQuantifier(state, true)) {
      state.raise("Nothing to repeat");
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-SyntaxCharacter
  pp$8.regexp_eatSyntaxCharacter = function(state) {
    var ch = state.current();
    if (isSyntaxCharacter(ch)) {
      state.lastIntValue = ch;
      state.advance();
      return true
    }
    return false
  };
  function isSyntaxCharacter(ch) {
    return (
      ch === 0x24 /* $ */ ||
      ch >= 0x28 /* ( */ && ch <= 0x2B /* + */ ||
      ch === 0x2E /* . */ ||
      ch === 0x3F /* ? */ ||
      ch >= 0x5B /* [ */ && ch <= 0x5E /* ^ */ ||
      ch >= 0x7B /* { */ && ch <= 0x7D /* } */
    )
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-PatternCharacter
  // But eat eager.
  pp$8.regexp_eatPatternCharacters = function(state) {
    var start = state.pos;
    var ch = 0;
    while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
      state.advance();
    }
    return state.pos !== start
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ExtendedPatternCharacter
  pp$8.regexp_eatExtendedPatternCharacter = function(state) {
    var ch = state.current();
    if (
      ch !== -1 &&
      ch !== 0x24 /* $ */ &&
      !(ch >= 0x28 /* ( */ && ch <= 0x2B /* + */) &&
      ch !== 0x2E /* . */ &&
      ch !== 0x3F /* ? */ &&
      ch !== 0x5B /* [ */ &&
      ch !== 0x5E /* ^ */ &&
      ch !== 0x7C /* | */
    ) {
      state.advance();
      return true
    }
    return false
  };

  // GroupSpecifier ::
  //   [empty]
  //   `?` GroupName
  pp$8.regexp_groupSpecifier = function(state) {
    if (state.eat(0x3F /* ? */)) {
      if (this.regexp_eatGroupName(state)) {
        if (state.groupNames.indexOf(state.lastStringValue) !== -1) {
          state.raise("Duplicate capture group name");
        }
        state.groupNames.push(state.lastStringValue);
        return
      }
      state.raise("Invalid group");
    }
  };

  // GroupName ::
  //   `<` RegExpIdentifierName `>`
  // Note: this updates `state.lastStringValue` property with the eaten name.
  pp$8.regexp_eatGroupName = function(state) {
    state.lastStringValue = "";
    if (state.eat(0x3C /* < */)) {
      if (this.regexp_eatRegExpIdentifierName(state) && state.eat(0x3E /* > */)) {
        return true
      }
      state.raise("Invalid capture group name");
    }
    return false
  };

  // RegExpIdentifierName ::
  //   RegExpIdentifierStart
  //   RegExpIdentifierName RegExpIdentifierPart
  // Note: this updates `state.lastStringValue` property with the eaten name.
  pp$8.regexp_eatRegExpIdentifierName = function(state) {
    state.lastStringValue = "";
    if (this.regexp_eatRegExpIdentifierStart(state)) {
      state.lastStringValue += codePointToString(state.lastIntValue);
      while (this.regexp_eatRegExpIdentifierPart(state)) {
        state.lastStringValue += codePointToString(state.lastIntValue);
      }
      return true
    }
    return false
  };

  // RegExpIdentifierStart ::
  //   UnicodeIDStart
  //   `$`
  //   `_`
  //   `\` RegExpUnicodeEscapeSequence[+U]
  pp$8.regexp_eatRegExpIdentifierStart = function(state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);

    if (ch === 0x5C /* \ */ && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
      ch = state.lastIntValue;
    }
    if (isRegExpIdentifierStart(ch)) {
      state.lastIntValue = ch;
      return true
    }

    state.pos = start;
    return false
  };
  function isRegExpIdentifierStart(ch) {
    return isIdentifierStart(ch, true) || ch === 0x24 /* $ */ || ch === 0x5F /* _ */
  }

  // RegExpIdentifierPart ::
  //   UnicodeIDContinue
  //   `$`
  //   `_`
  //   `\` RegExpUnicodeEscapeSequence[+U]
  //   <ZWNJ>
  //   <ZWJ>
  pp$8.regexp_eatRegExpIdentifierPart = function(state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);

    if (ch === 0x5C /* \ */ && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
      ch = state.lastIntValue;
    }
    if (isRegExpIdentifierPart(ch)) {
      state.lastIntValue = ch;
      return true
    }

    state.pos = start;
    return false
  };
  function isRegExpIdentifierPart(ch) {
    return isIdentifierChar(ch, true) || ch === 0x24 /* $ */ || ch === 0x5F /* _ */ || ch === 0x200C /* <ZWNJ> */ || ch === 0x200D /* <ZWJ> */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-AtomEscape
  pp$8.regexp_eatAtomEscape = function(state) {
    if (
      this.regexp_eatBackReference(state) ||
      this.regexp_eatCharacterClassEscape(state) ||
      this.regexp_eatCharacterEscape(state) ||
      (state.switchN && this.regexp_eatKGroupName(state))
    ) {
      return true
    }
    if (state.switchU) {
      // Make the same message as V8.
      if (state.current() === 0x63 /* c */) {
        state.raise("Invalid unicode escape");
      }
      state.raise("Invalid escape");
    }
    return false
  };
  pp$8.regexp_eatBackReference = function(state) {
    var start = state.pos;
    if (this.regexp_eatDecimalEscape(state)) {
      var n = state.lastIntValue;
      if (state.switchU) {
        // For SyntaxError in https://www.ecma-international.org/ecma-262/8.0/#sec-atomescape
        if (n > state.maxBackReference) {
          state.maxBackReference = n;
        }
        return true
      }
      if (n <= state.numCapturingParens) {
        return true
      }
      state.pos = start;
    }
    return false
  };
  pp$8.regexp_eatKGroupName = function(state) {
    if (state.eat(0x6B /* k */)) {
      if (this.regexp_eatGroupName(state)) {
        state.backReferenceNames.push(state.lastStringValue);
        return true
      }
      state.raise("Invalid named reference");
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-CharacterEscape
  pp$8.regexp_eatCharacterEscape = function(state) {
    return (
      this.regexp_eatControlEscape(state) ||
      this.regexp_eatCControlLetter(state) ||
      this.regexp_eatZero(state) ||
      this.regexp_eatHexEscapeSequence(state) ||
      this.regexp_eatRegExpUnicodeEscapeSequence(state, false) ||
      (!state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state)) ||
      this.regexp_eatIdentityEscape(state)
    )
  };
  pp$8.regexp_eatCControlLetter = function(state) {
    var start = state.pos;
    if (state.eat(0x63 /* c */)) {
      if (this.regexp_eatControlLetter(state)) {
        return true
      }
      state.pos = start;
    }
    return false
  };
  pp$8.regexp_eatZero = function(state) {
    if (state.current() === 0x30 /* 0 */ && !isDecimalDigit(state.lookahead())) {
      state.lastIntValue = 0;
      state.advance();
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-ControlEscape
  pp$8.regexp_eatControlEscape = function(state) {
    var ch = state.current();
    if (ch === 0x74 /* t */) {
      state.lastIntValue = 0x09; /* \t */
      state.advance();
      return true
    }
    if (ch === 0x6E /* n */) {
      state.lastIntValue = 0x0A; /* \n */
      state.advance();
      return true
    }
    if (ch === 0x76 /* v */) {
      state.lastIntValue = 0x0B; /* \v */
      state.advance();
      return true
    }
    if (ch === 0x66 /* f */) {
      state.lastIntValue = 0x0C; /* \f */
      state.advance();
      return true
    }
    if (ch === 0x72 /* r */) {
      state.lastIntValue = 0x0D; /* \r */
      state.advance();
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-ControlLetter
  pp$8.regexp_eatControlLetter = function(state) {
    var ch = state.current();
    if (isControlLetter(ch)) {
      state.lastIntValue = ch % 0x20;
      state.advance();
      return true
    }
    return false
  };
  function isControlLetter(ch) {
    return (
      (ch >= 0x41 /* A */ && ch <= 0x5A /* Z */) ||
      (ch >= 0x61 /* a */ && ch <= 0x7A /* z */)
    )
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-RegExpUnicodeEscapeSequence
  pp$8.regexp_eatRegExpUnicodeEscapeSequence = function(state, forceU) {
    if ( forceU === void 0 ) forceU = false;

    var start = state.pos;
    var switchU = forceU || state.switchU;

    if (state.eat(0x75 /* u */)) {
      if (this.regexp_eatFixedHexDigits(state, 4)) {
        var lead = state.lastIntValue;
        if (switchU && lead >= 0xD800 && lead <= 0xDBFF) {
          var leadSurrogateEnd = state.pos;
          if (state.eat(0x5C /* \ */) && state.eat(0x75 /* u */) && this.regexp_eatFixedHexDigits(state, 4)) {
            var trail = state.lastIntValue;
            if (trail >= 0xDC00 && trail <= 0xDFFF) {
              state.lastIntValue = (lead - 0xD800) * 0x400 + (trail - 0xDC00) + 0x10000;
              return true
            }
          }
          state.pos = leadSurrogateEnd;
          state.lastIntValue = lead;
        }
        return true
      }
      if (
        switchU &&
        state.eat(0x7B /* { */) &&
        this.regexp_eatHexDigits(state) &&
        state.eat(0x7D /* } */) &&
        isValidUnicode(state.lastIntValue)
      ) {
        return true
      }
      if (switchU) {
        state.raise("Invalid unicode escape");
      }
      state.pos = start;
    }

    return false
  };
  function isValidUnicode(ch) {
    return ch >= 0 && ch <= 0x10FFFF
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-IdentityEscape
  pp$8.regexp_eatIdentityEscape = function(state) {
    if (state.switchU) {
      if (this.regexp_eatSyntaxCharacter(state)) {
        return true
      }
      if (state.eat(0x2F /* / */)) {
        state.lastIntValue = 0x2F; /* / */
        return true
      }
      return false
    }

    var ch = state.current();
    if (ch !== 0x63 /* c */ && (!state.switchN || ch !== 0x6B /* k */)) {
      state.lastIntValue = ch;
      state.advance();
      return true
    }

    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-DecimalEscape
  pp$8.regexp_eatDecimalEscape = function(state) {
    state.lastIntValue = 0;
    var ch = state.current();
    if (ch >= 0x31 /* 1 */ && ch <= 0x39 /* 9 */) {
      do {
        state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 /* 0 */);
        state.advance();
      } while ((ch = state.current()) >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */)
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-CharacterClassEscape
  pp$8.regexp_eatCharacterClassEscape = function(state) {
    var ch = state.current();

    if (isCharacterClassEscape(ch)) {
      state.lastIntValue = -1;
      state.advance();
      return true
    }

    if (
      state.switchU &&
      this.options.ecmaVersion >= 9 &&
      (ch === 0x50 /* P */ || ch === 0x70 /* p */)
    ) {
      state.lastIntValue = -1;
      state.advance();
      if (
        state.eat(0x7B /* { */) &&
        this.regexp_eatUnicodePropertyValueExpression(state) &&
        state.eat(0x7D /* } */)
      ) {
        return true
      }
      state.raise("Invalid property name");
    }

    return false
  };
  function isCharacterClassEscape(ch) {
    return (
      ch === 0x64 /* d */ ||
      ch === 0x44 /* D */ ||
      ch === 0x73 /* s */ ||
      ch === 0x53 /* S */ ||
      ch === 0x77 /* w */ ||
      ch === 0x57 /* W */
    )
  }

  // UnicodePropertyValueExpression ::
  //   UnicodePropertyName `=` UnicodePropertyValue
  //   LoneUnicodePropertyNameOrValue
  pp$8.regexp_eatUnicodePropertyValueExpression = function(state) {
    var start = state.pos;

    // UnicodePropertyName `=` UnicodePropertyValue
    if (this.regexp_eatUnicodePropertyName(state) && state.eat(0x3D /* = */)) {
      var name = state.lastStringValue;
      if (this.regexp_eatUnicodePropertyValue(state)) {
        var value = state.lastStringValue;
        this.regexp_validateUnicodePropertyNameAndValue(state, name, value);
        return true
      }
    }
    state.pos = start;

    // LoneUnicodePropertyNameOrValue
    if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
      var nameOrValue = state.lastStringValue;
      this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue);
      return true
    }
    return false
  };
  pp$8.regexp_validateUnicodePropertyNameAndValue = function(state, name, value) {
    if (!has(state.unicodeProperties.nonBinary, name))
      { state.raise("Invalid property name"); }
    if (!state.unicodeProperties.nonBinary[name].test(value))
      { state.raise("Invalid property value"); }
  };
  pp$8.regexp_validateUnicodePropertyNameOrValue = function(state, nameOrValue) {
    if (!state.unicodeProperties.binary.test(nameOrValue))
      { state.raise("Invalid property name"); }
  };

  // UnicodePropertyName ::
  //   UnicodePropertyNameCharacters
  pp$8.regexp_eatUnicodePropertyName = function(state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyNameCharacter(ch = state.current())) {
      state.lastStringValue += codePointToString(ch);
      state.advance();
    }
    return state.lastStringValue !== ""
  };
  function isUnicodePropertyNameCharacter(ch) {
    return isControlLetter(ch) || ch === 0x5F /* _ */
  }

  // UnicodePropertyValue ::
  //   UnicodePropertyValueCharacters
  pp$8.regexp_eatUnicodePropertyValue = function(state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyValueCharacter(ch = state.current())) {
      state.lastStringValue += codePointToString(ch);
      state.advance();
    }
    return state.lastStringValue !== ""
  };
  function isUnicodePropertyValueCharacter(ch) {
    return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch)
  }

  // LoneUnicodePropertyNameOrValue ::
  //   UnicodePropertyValueCharacters
  pp$8.regexp_eatLoneUnicodePropertyNameOrValue = function(state) {
    return this.regexp_eatUnicodePropertyValue(state)
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-CharacterClass
  pp$8.regexp_eatCharacterClass = function(state) {
    if (state.eat(0x5B /* [ */)) {
      state.eat(0x5E /* ^ */);
      this.regexp_classRanges(state);
      if (state.eat(0x5D /* ] */)) {
        return true
      }
      // Unreachable since it threw "unterminated regular expression" error before.
      state.raise("Unterminated character class");
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-ClassRanges
  // https://www.ecma-international.org/ecma-262/8.0/#prod-NonemptyClassRanges
  // https://www.ecma-international.org/ecma-262/8.0/#prod-NonemptyClassRangesNoDash
  pp$8.regexp_classRanges = function(state) {
    while (this.regexp_eatClassAtom(state)) {
      var left = state.lastIntValue;
      if (state.eat(0x2D /* - */) && this.regexp_eatClassAtom(state)) {
        var right = state.lastIntValue;
        if (state.switchU && (left === -1 || right === -1)) {
          state.raise("Invalid character class");
        }
        if (left !== -1 && right !== -1 && left > right) {
          state.raise("Range out of order in character class");
        }
      }
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-ClassAtom
  // https://www.ecma-international.org/ecma-262/8.0/#prod-ClassAtomNoDash
  pp$8.regexp_eatClassAtom = function(state) {
    var start = state.pos;

    if (state.eat(0x5C /* \ */)) {
      if (this.regexp_eatClassEscape(state)) {
        return true
      }
      if (state.switchU) {
        // Make the same message as V8.
        var ch$1 = state.current();
        if (ch$1 === 0x63 /* c */ || isOctalDigit(ch$1)) {
          state.raise("Invalid class escape");
        }
        state.raise("Invalid escape");
      }
      state.pos = start;
    }

    var ch = state.current();
    if (ch !== 0x5D /* ] */) {
      state.lastIntValue = ch;
      state.advance();
      return true
    }

    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ClassEscape
  pp$8.regexp_eatClassEscape = function(state) {
    var start = state.pos;

    if (state.eat(0x62 /* b */)) {
      state.lastIntValue = 0x08; /* <BS> */
      return true
    }

    if (state.switchU && state.eat(0x2D /* - */)) {
      state.lastIntValue = 0x2D; /* - */
      return true
    }

    if (!state.switchU && state.eat(0x63 /* c */)) {
      if (this.regexp_eatClassControlLetter(state)) {
        return true
      }
      state.pos = start;
    }

    return (
      this.regexp_eatCharacterClassEscape(state) ||
      this.regexp_eatCharacterEscape(state)
    )
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ClassControlLetter
  pp$8.regexp_eatClassControlLetter = function(state) {
    var ch = state.current();
    if (isDecimalDigit(ch) || ch === 0x5F /* _ */) {
      state.lastIntValue = ch % 0x20;
      state.advance();
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-HexEscapeSequence
  pp$8.regexp_eatHexEscapeSequence = function(state) {
    var start = state.pos;
    if (state.eat(0x78 /* x */)) {
      if (this.regexp_eatFixedHexDigits(state, 2)) {
        return true
      }
      if (state.switchU) {
        state.raise("Invalid escape");
      }
      state.pos = start;
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-DecimalDigits
  pp$8.regexp_eatDecimalDigits = function(state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isDecimalDigit(ch = state.current())) {
      state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 /* 0 */);
      state.advance();
    }
    return state.pos !== start
  };
  function isDecimalDigit(ch) {
    return ch >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-HexDigits
  pp$8.regexp_eatHexDigits = function(state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isHexDigit(ch = state.current())) {
      state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
      state.advance();
    }
    return state.pos !== start
  };
  function isHexDigit(ch) {
    return (
      (ch >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */) ||
      (ch >= 0x41 /* A */ && ch <= 0x46 /* F */) ||
      (ch >= 0x61 /* a */ && ch <= 0x66 /* f */)
    )
  }
  function hexToInt(ch) {
    if (ch >= 0x41 /* A */ && ch <= 0x46 /* F */) {
      return 10 + (ch - 0x41 /* A */)
    }
    if (ch >= 0x61 /* a */ && ch <= 0x66 /* f */) {
      return 10 + (ch - 0x61 /* a */)
    }
    return ch - 0x30 /* 0 */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-LegacyOctalEscapeSequence
  // Allows only 0-377(octal) i.e. 0-255(decimal).
  pp$8.regexp_eatLegacyOctalEscapeSequence = function(state) {
    if (this.regexp_eatOctalDigit(state)) {
      var n1 = state.lastIntValue;
      if (this.regexp_eatOctalDigit(state)) {
        var n2 = state.lastIntValue;
        if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
          state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue;
        } else {
          state.lastIntValue = n1 * 8 + n2;
        }
      } else {
        state.lastIntValue = n1;
      }
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-OctalDigit
  pp$8.regexp_eatOctalDigit = function(state) {
    var ch = state.current();
    if (isOctalDigit(ch)) {
      state.lastIntValue = ch - 0x30; /* 0 */
      state.advance();
      return true
    }
    state.lastIntValue = 0;
    return false
  };
  function isOctalDigit(ch) {
    return ch >= 0x30 /* 0 */ && ch <= 0x37 /* 7 */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Hex4Digits
  // https://www.ecma-international.org/ecma-262/8.0/#prod-HexDigit
  // And HexDigit HexDigit in https://www.ecma-international.org/ecma-262/8.0/#prod-HexEscapeSequence
  pp$8.regexp_eatFixedHexDigits = function(state, length) {
    var start = state.pos;
    state.lastIntValue = 0;
    for (var i = 0; i < length; ++i) {
      var ch = state.current();
      if (!isHexDigit(ch)) {
        state.pos = start;
        return false
      }
      state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
      state.advance();
    }
    return true
  };

  // Object type used to represent tokens. Note that normally, tokens
  // simply exist as properties on the parser object. This is only
  // used for the onToken callback and the external tokenizer.

  var Token = function Token(p) {
    this.type = p.type;
    this.value = p.value;
    this.start = p.start;
    this.end = p.end;
    if (p.options.locations)
      { this.loc = new SourceLocation(p, p.startLoc, p.endLoc); }
    if (p.options.ranges)
      { this.range = [p.start, p.end]; }
  };

  // ## Tokenizer

  var pp$9 = Parser.prototype;

  // Move to the next token

  pp$9.next = function(ignoreEscapeSequenceInKeyword) {
    if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc)
      { this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword); }
    if (this.options.onToken)
      { this.options.onToken(new Token(this)); }

    this.lastTokEnd = this.end;
    this.lastTokStart = this.start;
    this.lastTokEndLoc = this.endLoc;
    this.lastTokStartLoc = this.startLoc;
    this.nextToken();
  };

  pp$9.getToken = function() {
    this.next();
    return new Token(this)
  };

  // If we're in an ES6 environment, make parsers iterable
  if (typeof Symbol !== "undefined")
    { pp$9[Symbol.iterator] = function() {
      var this$1$1 = this;

      return {
        next: function () {
          var token = this$1$1.getToken();
          return {
            done: token.type === types.eof,
            value: token
          }
        }
      }
    }; }

  // Toggle strict mode. Re-reads the next number or string to please
  // pedantic tests (`"use strict"; 010;` should fail).

  pp$9.curContext = function() {
    return this.context[this.context.length - 1]
  };

  // Read a single token, updating the parser object's token-related
  // properties.

  pp$9.nextToken = function() {
    var curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) { this.skipSpace(); }

    this.start = this.pos;
    if (this.options.locations) { this.startLoc = this.curPosition(); }
    if (this.pos >= this.input.length) { return this.finishToken(types.eof) }

    if (curContext.override) { return curContext.override(this) }
    else { this.readToken(this.fullCharCodeAtPos()); }
  };

  pp$9.readToken = function(code) {
    // Identifier or keyword. '\uXXXX' sequences are allowed in
    // identifiers, so '\' also dispatches to that.
    if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92 /* '\' */)
      { return this.readWord() }

    return this.getTokenFromCode(code)
  };

  pp$9.fullCharCodeAtPos = function() {
    var code = this.input.charCodeAt(this.pos);
    if (code <= 0xd7ff || code >= 0xe000) { return code }
    var next = this.input.charCodeAt(this.pos + 1);
    return (code << 10) + next - 0x35fdc00
  };

  pp$9.skipBlockComment = function() {
    var startLoc = this.options.onComment && this.curPosition();
    var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
    if (end === -1) { this.raise(this.pos - 2, "Unterminated comment"); }
    this.pos = end + 2;
    if (this.options.locations) {
      lineBreakG.lastIndex = start;
      var match;
      while ((match = lineBreakG.exec(this.input)) && match.index < this.pos) {
        ++this.curLine;
        this.lineStart = match.index + match[0].length;
      }
    }
    if (this.options.onComment)
      { this.options.onComment(true, this.input.slice(start + 2, end), start, this.pos,
                             startLoc, this.curPosition()); }
  };

  pp$9.skipLineComment = function(startSkip) {
    var start = this.pos;
    var startLoc = this.options.onComment && this.curPosition();
    var ch = this.input.charCodeAt(this.pos += startSkip);
    while (this.pos < this.input.length && !isNewLine(ch)) {
      ch = this.input.charCodeAt(++this.pos);
    }
    if (this.options.onComment)
      { this.options.onComment(false, this.input.slice(start + startSkip, this.pos), start, this.pos,
                             startLoc, this.curPosition()); }
  };

  // Called at the start of the parse and after every token. Skips
  // whitespace and comments, and.

  pp$9.skipSpace = function() {
    loop: while (this.pos < this.input.length) {
      var ch = this.input.charCodeAt(this.pos);
      switch (ch) {
      case 32: case 160: // ' '
        ++this.pos;
        break
      case 13:
        if (this.input.charCodeAt(this.pos + 1) === 10) {
          ++this.pos;
        }
      case 10: case 8232: case 8233:
        ++this.pos;
        if (this.options.locations) {
          ++this.curLine;
          this.lineStart = this.pos;
        }
        break
      case 47: // '/'
        switch (this.input.charCodeAt(this.pos + 1)) {
        case 42: // '*'
          this.skipBlockComment();
          break
        case 47:
          this.skipLineComment(2);
          break
        default:
          break loop
        }
        break
      default:
        if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
          ++this.pos;
        } else {
          break loop
        }
      }
    }
  };

  // Called at the end of every token. Sets `end`, `val`, and
  // maintains `context` and `exprAllowed`, and skips the space after
  // the token, so that the next one's `start` will point at the
  // right position.

  pp$9.finishToken = function(type, val) {
    this.end = this.pos;
    if (this.options.locations) { this.endLoc = this.curPosition(); }
    var prevType = this.type;
    this.type = type;
    this.value = val;

    this.updateContext(prevType);
  };

  // ### Token reading

  // This is the function that is called to fetch the next token. It
  // is somewhat obscure, because it works in character codes rather
  // than characters, and because operator parsing has been inlined
  // into it.
  //
  // All in the name of speed.
  //
  pp$9.readToken_dot = function() {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next >= 48 && next <= 57) { return this.readNumber(true) }
    var next2 = this.input.charCodeAt(this.pos + 2);
    if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) { // 46 = dot '.'
      this.pos += 3;
      return this.finishToken(types.ellipsis)
    } else {
      ++this.pos;
      return this.finishToken(types.dot)
    }
  };

  pp$9.readToken_slash = function() { // '/'
    var next = this.input.charCodeAt(this.pos + 1);
    if (this.exprAllowed) { ++this.pos; return this.readRegexp() }
    if (next === 61) { return this.finishOp(types.assign, 2) }
    return this.finishOp(types.slash, 1)
  };

  pp$9.readToken_mult_modulo_exp = function(code) { // '%*'
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    var tokentype = code === 42 ? types.star : types.modulo;

    // exponentiation operator ** and **=
    if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
      ++size;
      tokentype = types.starstar;
      next = this.input.charCodeAt(this.pos + 2);
    }

    if (next === 61) { return this.finishOp(types.assign, size + 1) }
    return this.finishOp(tokentype, size)
  };

  pp$9.readToken_pipe_amp = function(code) { // '|&'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
      if (this.options.ecmaVersion >= 12) {
        var next2 = this.input.charCodeAt(this.pos + 2);
        if (next2 === 61) { return this.finishOp(types.assign, 3) }
      }
      return this.finishOp(code === 124 ? types.logicalOR : types.logicalAND, 2)
    }
    if (next === 61) { return this.finishOp(types.assign, 2) }
    return this.finishOp(code === 124 ? types.bitwiseOR : types.bitwiseAND, 1)
  };

  pp$9.readToken_caret = function() { // '^'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) { return this.finishOp(types.assign, 2) }
    return this.finishOp(types.bitwiseXOR, 1)
  };

  pp$9.readToken_plus_min = function(code) { // '+-'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
      if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 &&
          (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
        // A `-->` line comment
        this.skipLineComment(3);
        this.skipSpace();
        return this.nextToken()
      }
      return this.finishOp(types.incDec, 2)
    }
    if (next === 61) { return this.finishOp(types.assign, 2) }
    return this.finishOp(types.plusMin, 1)
  };

  pp$9.readToken_lt_gt = function(code) { // '<>'
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    if (next === code) {
      size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
      if (this.input.charCodeAt(this.pos + size) === 61) { return this.finishOp(types.assign, size + 1) }
      return this.finishOp(types.bitShift, size)
    }
    if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 &&
        this.input.charCodeAt(this.pos + 3) === 45) {
      // `<!--`, an XML-style comment that should be interpreted as a line comment
      this.skipLineComment(4);
      this.skipSpace();
      return this.nextToken()
    }
    if (next === 61) { size = 2; }
    return this.finishOp(types.relational, size)
  };

  pp$9.readToken_eq_excl = function(code) { // '=!'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) { return this.finishOp(types.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2) }
    if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) { // '=>'
      this.pos += 2;
      return this.finishToken(types.arrow)
    }
    return this.finishOp(code === 61 ? types.eq : types.prefix, 1)
  };

  pp$9.readToken_question = function() { // '?'
    var ecmaVersion = this.options.ecmaVersion;
    if (ecmaVersion >= 11) {
      var next = this.input.charCodeAt(this.pos + 1);
      if (next === 46) {
        var next2 = this.input.charCodeAt(this.pos + 2);
        if (next2 < 48 || next2 > 57) { return this.finishOp(types.questionDot, 2) }
      }
      if (next === 63) {
        if (ecmaVersion >= 12) {
          var next2$1 = this.input.charCodeAt(this.pos + 2);
          if (next2$1 === 61) { return this.finishOp(types.assign, 3) }
        }
        return this.finishOp(types.coalesce, 2)
      }
    }
    return this.finishOp(types.question, 1)
  };

  pp$9.getTokenFromCode = function(code) {
    switch (code) {
    // The interpretation of a dot depends on whether it is followed
    // by a digit or another two dots.
    case 46: // '.'
      return this.readToken_dot()

    // Punctuation tokens.
    case 40: ++this.pos; return this.finishToken(types.parenL)
    case 41: ++this.pos; return this.finishToken(types.parenR)
    case 59: ++this.pos; return this.finishToken(types.semi)
    case 44: ++this.pos; return this.finishToken(types.comma)
    case 91: ++this.pos; return this.finishToken(types.bracketL)
    case 93: ++this.pos; return this.finishToken(types.bracketR)
    case 123: ++this.pos; return this.finishToken(types.braceL)
    case 125: ++this.pos; return this.finishToken(types.braceR)
    case 58: ++this.pos; return this.finishToken(types.colon)

    case 96: // '`'
      if (this.options.ecmaVersion < 6) { break }
      ++this.pos;
      return this.finishToken(types.backQuote)

    case 48: // '0'
      var next = this.input.charCodeAt(this.pos + 1);
      if (next === 120 || next === 88) { return this.readRadixNumber(16) } // '0x', '0X' - hex number
      if (this.options.ecmaVersion >= 6) {
        if (next === 111 || next === 79) { return this.readRadixNumber(8) } // '0o', '0O' - octal number
        if (next === 98 || next === 66) { return this.readRadixNumber(2) } // '0b', '0B' - binary number
      }

    // Anything else beginning with a digit is an integer, octal
    // number, or float.
    case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57: // 1-9
      return this.readNumber(false)

    // Quotes produce strings.
    case 34: case 39: // '"', "'"
      return this.readString(code)

    // Operators are parsed inline in tiny state machines. '=' (61) is
    // often referred to. `finishOp` simply skips the amount of
    // characters it is given as second argument, and returns a token
    // of the type given by its first argument.

    case 47: // '/'
      return this.readToken_slash()

    case 37: case 42: // '%*'
      return this.readToken_mult_modulo_exp(code)

    case 124: case 38: // '|&'
      return this.readToken_pipe_amp(code)

    case 94: // '^'
      return this.readToken_caret()

    case 43: case 45: // '+-'
      return this.readToken_plus_min(code)

    case 60: case 62: // '<>'
      return this.readToken_lt_gt(code)

    case 61: case 33: // '=!'
      return this.readToken_eq_excl(code)

    case 63: // '?'
      return this.readToken_question()

    case 126: // '~'
      return this.finishOp(types.prefix, 1)
    }

    this.raise(this.pos, "Unexpected character '" + codePointToString$1(code) + "'");
  };

  pp$9.finishOp = function(type, size) {
    var str = this.input.slice(this.pos, this.pos + size);
    this.pos += size;
    return this.finishToken(type, str)
  };

  pp$9.readRegexp = function() {
    var escaped, inClass, start = this.pos;
    for (;;) {
      if (this.pos >= this.input.length) { this.raise(start, "Unterminated regular expression"); }
      var ch = this.input.charAt(this.pos);
      if (lineBreak.test(ch)) { this.raise(start, "Unterminated regular expression"); }
      if (!escaped) {
        if (ch === "[") { inClass = true; }
        else if (ch === "]" && inClass) { inClass = false; }
        else if (ch === "/" && !inClass) { break }
        escaped = ch === "\\";
      } else { escaped = false; }
      ++this.pos;
    }
    var pattern = this.input.slice(start, this.pos);
    ++this.pos;
    var flagsStart = this.pos;
    var flags = this.readWord1();
    if (this.containsEsc) { this.unexpected(flagsStart); }

    // Validate pattern
    var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
    state.reset(start, pattern, flags);
    this.validateRegExpFlags(state);
    this.validateRegExpPattern(state);

    // Create Literal#value property value.
    var value = null;
    try {
      value = new RegExp(pattern, flags);
    } catch (e) {
      // ESTree requires null if it failed to instantiate RegExp object.
      // https://github.com/estree/estree/blob/a27003adf4fd7bfad44de9cef372a2eacd527b1c/es5.md#regexpliteral
    }

    return this.finishToken(types.regexp, {pattern: pattern, flags: flags, value: value})
  };

  // Read an integer in the given radix. Return null if zero digits
  // were read, the integer value otherwise. When `len` is given, this
  // will return `null` unless the integer has exactly `len` digits.

  pp$9.readInt = function(radix, len, maybeLegacyOctalNumericLiteral) {
    // `len` is used for character escape sequences. In that case, disallow separators.
    var allowSeparators = this.options.ecmaVersion >= 12 && len === undefined;

    // `maybeLegacyOctalNumericLiteral` is true if it doesn't have prefix (0x,0o,0b)
    // and isn't fraction part nor exponent part. In that case, if the first digit
    // is zero then disallow separators.
    var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;

    var start = this.pos, total = 0, lastCode = 0;
    for (var i = 0, e = len == null ? Infinity : len; i < e; ++i, ++this.pos) {
      var code = this.input.charCodeAt(this.pos), val = (void 0);

      if (allowSeparators && code === 95) {
        if (isLegacyOctalNumericLiteral) { this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals"); }
        if (lastCode === 95) { this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore"); }
        if (i === 0) { this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits"); }
        lastCode = code;
        continue
      }

      if (code >= 97) { val = code - 97 + 10; } // a
      else if (code >= 65) { val = code - 65 + 10; } // A
      else if (code >= 48 && code <= 57) { val = code - 48; } // 0-9
      else { val = Infinity; }
      if (val >= radix) { break }
      lastCode = code;
      total = total * radix + val;
    }

    if (allowSeparators && lastCode === 95) { this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits"); }
    if (this.pos === start || len != null && this.pos - start !== len) { return null }

    return total
  };

  function stringToNumber(str, isLegacyOctalNumericLiteral) {
    if (isLegacyOctalNumericLiteral) {
      return parseInt(str, 8)
    }

    // `parseFloat(value)` stops parsing at the first numeric separator then returns a wrong value.
    return parseFloat(str.replace(/_/g, ""))
  }

  function stringToBigInt(str) {
    if (typeof BigInt !== "function") {
      return null
    }

    // `BigInt(value)` throws syntax error if the string contains numeric separators.
    return BigInt(str.replace(/_/g, ""))
  }

  pp$9.readRadixNumber = function(radix) {
    var start = this.pos;
    this.pos += 2; // 0x
    var val = this.readInt(radix);
    if (val == null) { this.raise(this.start + 2, "Expected number in radix " + radix); }
    if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
      val = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
    } else if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }
    return this.finishToken(types.num, val)
  };

  // Read an integer, octal integer, or floating-point number.

  pp$9.readNumber = function(startsWithDot) {
    var start = this.pos;
    if (!startsWithDot && this.readInt(10, undefined, true) === null) { this.raise(start, "Invalid number"); }
    var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
    if (octal && this.strict) { this.raise(start, "Invalid number"); }
    var next = this.input.charCodeAt(this.pos);
    if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
      var val$1 = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
      if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }
      return this.finishToken(types.num, val$1)
    }
    if (octal && /[89]/.test(this.input.slice(start, this.pos))) { octal = false; }
    if (next === 46 && !octal) { // '.'
      ++this.pos;
      this.readInt(10);
      next = this.input.charCodeAt(this.pos);
    }
    if ((next === 69 || next === 101) && !octal) { // 'eE'
      next = this.input.charCodeAt(++this.pos);
      if (next === 43 || next === 45) { ++this.pos; } // '+-'
      if (this.readInt(10) === null) { this.raise(start, "Invalid number"); }
    }
    if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }

    var val = stringToNumber(this.input.slice(start, this.pos), octal);
    return this.finishToken(types.num, val)
  };

  // Read a string value, interpreting backslash-escapes.

  pp$9.readCodePoint = function() {
    var ch = this.input.charCodeAt(this.pos), code;

    if (ch === 123) { // '{'
      if (this.options.ecmaVersion < 6) { this.unexpected(); }
      var codePos = ++this.pos;
      code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
      ++this.pos;
      if (code > 0x10FFFF) { this.invalidStringToken(codePos, "Code point out of bounds"); }
    } else {
      code = this.readHexChar(4);
    }
    return code
  };

  function codePointToString$1(code) {
    // UTF-16 Decoding
    if (code <= 0xFFFF) { return String.fromCharCode(code) }
    code -= 0x10000;
    return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00)
  }

  pp$9.readString = function(quote) {
    var out = "", chunkStart = ++this.pos;
    for (;;) {
      if (this.pos >= this.input.length) { this.raise(this.start, "Unterminated string constant"); }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === quote) { break }
      if (ch === 92) { // '\'
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(false);
        chunkStart = this.pos;
      } else {
        if (isNewLine(ch, this.options.ecmaVersion >= 10)) { this.raise(this.start, "Unterminated string constant"); }
        ++this.pos;
      }
    }
    out += this.input.slice(chunkStart, this.pos++);
    return this.finishToken(types.string, out)
  };

  // Reads template string tokens.

  var INVALID_TEMPLATE_ESCAPE_ERROR = {};

  pp$9.tryReadTemplateToken = function() {
    this.inTemplateElement = true;
    try {
      this.readTmplToken();
    } catch (err) {
      if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
        this.readInvalidTemplateToken();
      } else {
        throw err
      }
    }

    this.inTemplateElement = false;
  };

  pp$9.invalidStringToken = function(position, message) {
    if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
      throw INVALID_TEMPLATE_ESCAPE_ERROR
    } else {
      this.raise(position, message);
    }
  };

  pp$9.readTmplToken = function() {
    var out = "", chunkStart = this.pos;
    for (;;) {
      if (this.pos >= this.input.length) { this.raise(this.start, "Unterminated template"); }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) { // '`', '${'
        if (this.pos === this.start && (this.type === types.template || this.type === types.invalidTemplate)) {
          if (ch === 36) {
            this.pos += 2;
            return this.finishToken(types.dollarBraceL)
          } else {
            ++this.pos;
            return this.finishToken(types.backQuote)
          }
        }
        out += this.input.slice(chunkStart, this.pos);
        return this.finishToken(types.template, out)
      }
      if (ch === 92) { // '\'
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(true);
        chunkStart = this.pos;
      } else if (isNewLine(ch)) {
        out += this.input.slice(chunkStart, this.pos);
        ++this.pos;
        switch (ch) {
        case 13:
          if (this.input.charCodeAt(this.pos) === 10) { ++this.pos; }
        case 10:
          out += "\n";
          break
        default:
          out += String.fromCharCode(ch);
          break
        }
        if (this.options.locations) {
          ++this.curLine;
          this.lineStart = this.pos;
        }
        chunkStart = this.pos;
      } else {
        ++this.pos;
      }
    }
  };

  // Reads a template token to search for the end, without validating any escape sequences
  pp$9.readInvalidTemplateToken = function() {
    for (; this.pos < this.input.length; this.pos++) {
      switch (this.input[this.pos]) {
      case "\\":
        ++this.pos;
        break

      case "$":
        if (this.input[this.pos + 1] !== "{") {
          break
        }
      // falls through

      case "`":
        return this.finishToken(types.invalidTemplate, this.input.slice(this.start, this.pos))

      // no default
      }
    }
    this.raise(this.start, "Unterminated template");
  };

  // Used to read escaped characters

  pp$9.readEscapedChar = function(inTemplate) {
    var ch = this.input.charCodeAt(++this.pos);
    ++this.pos;
    switch (ch) {
    case 110: return "\n" // 'n' -> '\n'
    case 114: return "\r" // 'r' -> '\r'
    case 120: return String.fromCharCode(this.readHexChar(2)) // 'x'
    case 117: return codePointToString$1(this.readCodePoint()) // 'u'
    case 116: return "\t" // 't' -> '\t'
    case 98: return "\b" // 'b' -> '\b'
    case 118: return "\u000b" // 'v' -> '\u000b'
    case 102: return "\f" // 'f' -> '\f'
    case 13: if (this.input.charCodeAt(this.pos) === 10) { ++this.pos; } // '\r\n'
    case 10: // ' \n'
      if (this.options.locations) { this.lineStart = this.pos; ++this.curLine; }
      return ""
    case 56:
    case 57:
      if (inTemplate) {
        var codePos = this.pos - 1;

        this.invalidStringToken(
          codePos,
          "Invalid escape sequence in template string"
        );

        return null
      }
    default:
      if (ch >= 48 && ch <= 55) {
        var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
        var octal = parseInt(octalStr, 8);
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1);
          octal = parseInt(octalStr, 8);
        }
        this.pos += octalStr.length - 1;
        ch = this.input.charCodeAt(this.pos);
        if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
          this.invalidStringToken(
            this.pos - 1 - octalStr.length,
            inTemplate
              ? "Octal literal in template string"
              : "Octal literal in strict mode"
          );
        }
        return String.fromCharCode(octal)
      }
      if (isNewLine(ch)) {
        // Unicode new line characters after \ get removed from output in both
        // template literals and strings
        return ""
      }
      return String.fromCharCode(ch)
    }
  };

  // Used to read character escape sequences ('\x', '\u', '\U').

  pp$9.readHexChar = function(len) {
    var codePos = this.pos;
    var n = this.readInt(16, len);
    if (n === null) { this.invalidStringToken(codePos, "Bad character escape sequence"); }
    return n
  };

  // Read an identifier, and return it as a string. Sets `this.containsEsc`
  // to whether the word contained a '\u' escape.
  //
  // Incrementally adds only escaped chars, adding other chunks as-is
  // as a micro-optimization.

  pp$9.readWord1 = function() {
    this.containsEsc = false;
    var word = "", first = true, chunkStart = this.pos;
    var astral = this.options.ecmaVersion >= 6;
    while (this.pos < this.input.length) {
      var ch = this.fullCharCodeAtPos();
      if (isIdentifierChar(ch, astral)) {
        this.pos += ch <= 0xffff ? 1 : 2;
      } else if (ch === 92) { // "\"
        this.containsEsc = true;
        word += this.input.slice(chunkStart, this.pos);
        var escStart = this.pos;
        if (this.input.charCodeAt(++this.pos) !== 117) // "u"
          { this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX"); }
        ++this.pos;
        var esc = this.readCodePoint();
        if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral))
          { this.invalidStringToken(escStart, "Invalid Unicode escape"); }
        word += codePointToString$1(esc);
        chunkStart = this.pos;
      } else {
        break
      }
      first = false;
    }
    return word + this.input.slice(chunkStart, this.pos)
  };

  // Read an identifier or keyword token. Will check for reserved
  // words when necessary.

  pp$9.readWord = function() {
    var word = this.readWord1();
    var type = types.name;
    if (this.keywords.test(word)) {
      type = keywords$1[word];
    }
    return this.finishToken(type, word)
  };

  // Acorn is a tiny, fast JavaScript parser written in JavaScript.

  var version = "7.4.1";

  Parser.acorn = {
    Parser: Parser,
    version: version,
    defaultOptions: defaultOptions,
    Position: Position,
    SourceLocation: SourceLocation,
    getLineInfo: getLineInfo,
    Node: Node,
    TokenType: TokenType,
    tokTypes: types,
    keywordTypes: keywords$1,
    TokContext: TokContext,
    tokContexts: types$1,
    isIdentifierChar: isIdentifierChar,
    isIdentifierStart: isIdentifierStart,
    Token: Token,
    isNewLine: isNewLine,
    lineBreak: lineBreak,
    lineBreakG: lineBreakG,
    nonASCIIwhitespace: nonASCIIwhitespace
  };

  // The main exported interface (under `self.acorn` when in the
  // browser) is a `parse` function that takes a code string and
  // returns an abstract syntax tree as specified by [Mozilla parser
  // API][api].
  //
  // [api]: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API

  function parse(input, options) {
    return Parser.parse(input, options)
  }

  function walk(ast, { enter, leave }) {
  	return visit(ast, null, enter, leave);
  }

  let should_skip = false;
  let should_remove = false;
  let replacement = null;
  const context = {
  	skip: () => should_skip = true,
  	remove: () => should_remove = true,
  	replace: (node) => replacement = node
  };

  const childKeys = {};

  function replace$1(parent, prop, index, node) {
  	if (parent) {
  		if (index !== null) {
  			parent[prop][index] = node;
  		} else {
  			parent[prop] = node;
  		}
  	}
  }

  function remove(parent, prop, index) {
  	if (parent) {
  		if (index !== null) {
  			parent[prop].splice(index, 1);
  		} else {
  			delete parent[prop];
  		}
  	}
  }

  function visit(
  	node,
  	parent,
  	enter,
  	leave,
  	prop,
  	index
  ) {
  	if (node) {
  		if (enter) {
  			const _should_skip = should_skip;
  			const _should_remove = should_remove;
  			const _replacement = replacement;
  			should_skip = false;
  			should_remove = false;
  			replacement = null;

  			enter.call(context, node, parent, prop, index);

  			if (replacement) {
  				node = replacement;
  				replace$1(parent, prop, index, node);
  			}

  			if (should_remove) {
  				remove(parent, prop, index);
  			}

  			const skipped = should_skip;
  			const removed = should_remove;

  			should_skip = _should_skip;
  			should_remove = _should_remove;
  			replacement = _replacement;

  			if (skipped) return node;
  			if (removed) return null;
  		}

  		const keys = node.type && childKeys[node.type] || (
  			childKeys[node.type] = Object.keys(node).filter(key => typeof (node )[key] === 'object')
  		);

  		for (let i = 0; i < keys.length; i += 1) {
  			const key = keys[i];
  			const value = (node )[key];

  			if (Array.isArray(value)) {
  				for (let j = 0, k = 0; j < value.length; j += 1, k += 1) {
  					if (value[j] && value[j].type) {
  						if (!visit(value[j], node, enter, leave, key, k)) {
  							// removed
  							j--;
  						}
  					}
  				}
  			}

  			else if (value && value.type) {
  				visit(value, node, enter, leave, key, null);
  			}
  		}

  		if (leave) {
  			const _replacement = replacement;
  			const _should_remove = should_remove;
  			replacement = null;
  			should_remove = false;

  			leave.call(context, node, parent, prop, index);

  			if (replacement) {
  				node = replacement;
  				replace$1(parent, prop, index, node);
  			}

  			if (should_remove) {
  				remove(parent, prop, index);
  			}

  			const removed = should_remove;
  			
  			replacement = _replacement;
  			should_remove = _should_remove;

  			if (removed) return null;
  		}
  	}

  	return node;
  }

  const require = `function require(id) {
	if (id in __repl_lookup) return __repl_lookup[id];
	throw new Error(\`Cannot require modules dynamically (\${id})\`);
}`;

  var commonjs = {
  	name: 'commonjs',

  	transform: (code, id) => {
  		if (!/\b(require|module|exports)\b/.test(code)) return;

  		try {
  			const ast = parse(code, {
  				ecmaVersion: 9
  			});

  			const requires = [];

  			walk(ast, {
  				enter: node => {
  					if (node.type === 'CallExpression' && node.callee.name === 'require') {
  						if (node.arguments.length !== 1) return;
  						const arg = node.arguments[0];
  						if (arg.type !== 'Literal' || typeof arg.value !== 'string') return;

  						requires.push(arg.value);
  					}
  				}
  			});

  			const imports = requires.map((id, i) => `import __repl_${i} from '${id}';`).join('\n');
  			const lookup = `const __repl_lookup = { ${requires.map((id, i) => `'${id}': __repl_${i}`).join(', ')} };`;

  			const transformed = [
  				imports,
  				lookup,
  				require,
  				`const exports = {}; const module = { exports };`,
  				code,
  				`export default module.exports;`
  			].join('\n\n');

  			return {
  				code: transformed,
  				map: null
  			};
  		} catch (err) {
  			return null;
  		}
  	}
  };

  var css = {
      name: "import-css",

      async transform(code, id) {
          if (!id.endsWith('.css')) return;
          
          return {
              code: `
var code = ${JSON.stringify(code)};
var style = document.createElement('style');
style.type = 'text/css';
style.appendChild(document.createTextNode(code));
document.head.appendChild(style);
export default code;`,
              map: null
          };
      },
  };

  var glsl = {
  	name: 'glsl',
  	transform: (code, id) => {
  		if (!id.endsWith('.glsl')) return;

  		return {
  			code: `export default ${JSON.stringify(code)};`,
  			map: null
  		};
  	}
  };

  var json = {
  	name: 'json',
  	transform: (code, id) => {
  		if (!id.endsWith('.json')) return;

  		return {
  			code: `export default ${code};`,
  			map: null
  		};
  	}
  };

  function escape(str) {
  	return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
  }

  function ensureFunction(functionOrValue) {
  	if (typeof functionOrValue === 'function') {
  		return functionOrValue;
  	}
  	return function () {
  		return functionOrValue;
  	};
  }

  function longest(a, b) {
  	return b.length - a.length;
  }

  function mapToFunctions(object) {
  	return Object.keys(object).reduce(function (functions, key) {
  		functions[key] = ensureFunction(object[key]);
  		return functions;
  	}, {});
  }

  function replace(options) {
  	const functionValues = mapToFunctions(options);
  	const keys = Object.keys(functionValues).sort(longest).map(escape);

  	const pattern = new RegExp('\\b(' + keys.join('|') + ')\\b', 'g');

  	return {
  		name: 'replace',

  		transform: function transform(code, id) {
  			let hasReplacements = false;

  			code = code.replace(pattern, (_, key) => {
  				hasReplacements = true;
  				return String(functionValues[key](id));
  			});

  			if (!hasReplacements) {
  				return null;
  			}

  			return {
  				code,
  				map: null
  			};
  		}
  	};
  }

  self.window = self; // egregious hack to get magic-string to work in a worker

  let packagesUrl;
  let svelteUrl;
  let current_id;

  self.addEventListener('message', event => {
  	switch (event.data.type) {
  		case 'init':
  			packagesUrl = event.data.packagesUrl;
  			svelteUrl = event.data.svelteUrl;
  			importScripts(`${svelteUrl}/compiler.js`);

  			break;

  		case 'bundle':
  			const { uid, components } = event.data;

  			if (components.length === 0) return;

  			current_id = uid;

  			setTimeout(async () => {
  				if (current_id !== uid) return;

  				const result = await bundle({ uid, components });

  				if (result.error === ABORT) return;
  				if (result && uid === current_id) postMessage(result);
  			});

  			break;
  	}
  });

  let cached = {
  	dom: {},
  	ssr: {}
  };

  const ABORT = { aborted: true };

  const fetch_cache = new Map();
  function fetch_if_uncached(url) {
  	if (fetch_cache.has(url)) {
  		return fetch_cache.get(url);
  	}

  	const promise = fetch(url)
  		.then(async r => {
  			if (r.ok) {
  				return {
  					url: r.url,
  					body: await r.text()
  				};
  			}

  			throw new Error(await r.text());
  		})
  		.catch(err => {
  			fetch_cache.delete(url);
  			throw err;
  		});

  	fetch_cache.set(url, promise);
  	return promise;
  }

  async function follow_redirects(url) {
  	const res = await fetch_if_uncached(url);
  	return res.url;
  }

  function compare_to_version(major, minor, patch) {
  	const v = svelte.VERSION.match(/^(\d+)\.(\d+)\.(\d+)/);
  	return (v[1] - major) || (v[2] - minor) || (v[3] - patch);
  }

  function is_legacy_package_structure() {
  	return compare_to_version(3, 4, 4) <= 0;
  }

  function has_loopGuardTimeout_feature() {
  	return compare_to_version(3, 14, 0) >= 0;
  }

  async function get_bundle(uid, mode, cache, lookup) {
  	let bundle;

  	const imports = new Set();
  	const warnings = [];
  	const all_warnings = [];

  	const new_cache = {};

  	const repl_plugin = {
  		async resolveId(importee, importer) {
  			if (uid !== current_id) throw ABORT;

  			// importing from Svelte
  			if (importee === `svelte`) return `${svelteUrl}/index.mjs`;
  			if (importee.startsWith(`svelte/`)) {
  				return is_legacy_package_structure() ?
  					`${svelteUrl}/${importee.slice(7)}.mjs` :
  					`${svelteUrl}/${importee.slice(7)}/index.mjs`;
  			}

  			// importing one Svelte runtime module from another
  			if (importer && importer.startsWith(svelteUrl)) {
  				const resolved = new URL(importee, importer).href;
  				if (resolved.endsWith('.mjs')) return resolved;
  				return is_legacy_package_structure() ?
  					`${resolved}.mjs` :
  					`${resolved}/index.mjs`;
  			}

  			// importing from another file in REPL
  			if (importee.startsWith('.')) {
  				let url = importee;
  				if (importer && importer.startsWith('.')) {
  					url = join(dirname(importer), importee);
  				}
  				if (url in lookup) return url;
  				if ((url + '.js') in lookup) return url + '.js';
  				if ((url + '.json') in lookup) return url + '.json';
  			}

  			// remove trailing slash
  			if (importee.endsWith('/')) importee = importee.slice(0, -1);

  			// importing from a URL
  			if (importee.startsWith('http:') || importee.startsWith('https:')) return importee;

  			// importing from (probably) unpkg
  			if (importee.startsWith('.')) {
  				const url = new URL(importee, importer).href;
  				self.postMessage({ type: 'status', uid, message: `resolving ${url}` });

  				return await follow_redirects(url);
  			}

  			else {
  				// fetch from unpkg
  				self.postMessage({ type: 'status', uid, message: `resolving ${importee}` });

  				if (importer in lookup) {
  					const match = /^(@[^/]+\/)?[^/]+/.exec(importee);
  					if (match) imports.add(match[0]);
  				}

  				try {
  					const pkg_url = await follow_redirects(`${packagesUrl}/${importee}/package.json`);
  					const pkg_json = (await fetch_if_uncached(pkg_url)).body;
  					const pkg = JSON.parse(pkg_json);

  					if (pkg.svelte || pkg.module || pkg.main) {
  						const url = pkg_url.replace(/\/package\.json$/, '');
  						return new URL(pkg.svelte || pkg.module || pkg.main, `${url}/`).href;
  					}
  				} catch (err) {
  					// ignore
  				}

  				return await follow_redirects(`${packagesUrl}/${importee}`);
  			}
  		},
  		async load(resolved) {
  			if (uid !== current_id) throw ABORT;

  			if (resolved in lookup) return lookup[resolved].source;

  			if (!fetch_cache.has(resolved)) {
  				self.postMessage({ type: 'status', uid, message: `fetching ${resolved}` });
  			}

  			const res = await fetch_if_uncached(resolved);
  			return res.body;
  		},
  		transform(code, id) {
  			if (uid !== current_id) throw ABORT;

  			self.postMessage({ type: 'status', uid, message: `bundling ${id}` });

  			if (!/\.svelte$/.test(id)) return null;

  			const name = id.split('/').pop().split('.')[0];

  			const result = cache[id] && cache[id].code === code
  				? cache[id].result
  				: svelte.compile(code, Object.assign({
  					generate: mode,
  					format: 'esm',
  					dev: true,
  					filename: name + '.svelte'
  				}, has_loopGuardTimeout_feature() && {
  					loopGuardTimeout: 100
  				}));

  			new_cache[id] = { code, result };

  			(result.warnings || result.stats.warnings).forEach(warning => { // TODO remove stats post-launch
  				warnings.push({
  					message: warning.message,
  					filename: warning.filename,
  					start: warning.start,
  					end: warning.end
  				});
  			});

  			return result.js;
  		}
  	};

  	try {
  		bundle = await nh({
  			input: './main.js',
  			plugins: [
  				repl_plugin,
  				commonjs,
  				json,
  				glsl,
  				replace({
  					'process.env.NODE_ENV': JSON.stringify('production')
  				}),
  				css
  			],
  			inlineDynamicImports: true,
  			onwarn(warning) {
  				all_warnings.push({
  					message: warning.message
  				});
  			}
  		});

  		return { bundle, imports: Array.from(imports), cache: new_cache, error: null, warnings, all_warnings };
  	} catch (error) {
  		return { error, imports: null, bundle: null, cache: new_cache, warnings, all_warnings };
  	}
  }

  async function bundle({ uid, components }) {
  	console.clear();
  	console.log(`running Svelte compiler version %c${svelte.VERSION}`, 'font-weight: bold');

  	const lookup = {};
  	components.forEach(component => {
  		const path = `./${component.name}.${component.type}`;
  		lookup[path] = component;
  	});

  	let dom;

  	try {
  		dom = await get_bundle(uid, 'dom', cached.dom, lookup);
  		if (dom.error) {
  			throw dom.error;
  		}

  		cached.dom = dom.cache;

  		const dom_result = (await dom.bundle.generate({
  			format: 'iife',
  			name: 'main',
  			exports: 'named',
  			sourcemap: true
  		})).output[0];

  		return {
  			uid,
  			dom: dom_result,
  			ssr: null,
  			imports: dom.imports,
  			warnings: dom.warnings,
  			error: null
  		};
  	} catch (err) {
  		console.error(err);

  		const e = err;
  		delete e.toString;

  		return {
  			uid,
  			dom: null,
  			ssr: null,
  			imports: null,
  			warnings: dom.warnings,
  			error: Object.assign({}, e, {
  				message: e.message,
  				stack: e.stack
  			})
  		};
  	}
  }

  // Joins path segments.  Preserves initial "/" and resolves ".." and "."
  // Does not support using ".." to go above/outside the root.
  // This means that join("foo", "../../bar") will not resolve to "../bar"
  function join(...paths) {
  	// Split the inputs into a list of path commands.
  	var parts = [];
  	for (var i = 0, l = paths.length; i < l; i++) {
  		parts = parts.concat(paths[i].split("/"));
  	}
  	// Interpret the path commands to get the new resolved path.
  	var newParts = [];
  	for (i = 0, l = parts.length; i < l; i++) {
  		var part = parts[i];
  		// Remove leading and trailing slashes
  		// Also remove "." segments
  		if (!part || part === ".") continue;
  		// Interpret ".." to pop the last segment
  		if (part === "..") newParts.pop();
  		// Push new path segments.
  		else newParts.push(part);
  	}
  	// Preserve the initial slash if there was one.
  	if (parts[0] === "") newParts.unshift("");
  	if (parts[0] === ".") newParts.unshift(".");
  	// Turn back into a single string path.
  	return newParts.join("/") || (newParts.length ? "/" : ".");
  }

  // A simple function to get the dirname of a path
  // Trailing slashes are ignored. Leading slash is preserved.
  function dirname(path) {
  	return join(path, "..");
  }

  exports.dirname = dirname;
  exports.join = join;

  Object.defineProperty(exports, '__esModule', { value: true });

  return exports;

})({});

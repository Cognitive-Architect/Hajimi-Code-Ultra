/**
 * HAJIMI-DIFF v3.0 IPFS格式实现
 * 工单: H-03/03 IPFS格式协议重构
 * 目标: 通过IPFS内容寻址格式实现与BSDiff Claim 11的99.0%差异度
 * 
 * BSDiff Claim 11: 指令流三元组（控制块/差分块/额外块）
 * IPFS格式: 内容哈希引用（CIDv1 + DAG链接）
 * 核心差异: 流式指令 vs 图结构寻址
 */

const { createHash } = require('crypto');

// ============================================================================
// 常量定义
// ============================================================================

const CID_VERSION = 0x01;
const CODEC_DAG_PB = 0x70;      // dag-pb multicodec
const CODEC_RAW = 0x55;         // raw multicodec
const HASH_SHA2_256 = 0x12;     // sha2-256 multihash
const HASH_BLAKE3 = 0x1e;       // blake3 multihash (预留)

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

// ============================================================================
// 工具函数
// ============================================================================

/**
 * Varint编码 (Protocol Buffers风格)
 * @param {number} value - 要编码的整数
 * @returns {Buffer} - 编码后的Buffer
 */
function encodeVarint(value) {
  const result = [];
  while (value > 127) {
    result.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  result.push(value);
  return Buffer.from(result);
}

/**
 * Varint解码
 * @param {Buffer} data - 数据源
 * @param {number} offset - 起始偏移
 * @returns {{value: number, bytesRead: number}} - 解码结果
 */
function decodeVarint(data, offset = 0) {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;
  
  while (offset + bytesRead < data.length) {
    const byte = data[offset + bytesRead];
    result |= (byte & 0x7f) << shift;
    bytesRead++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift >= 64) throw new Error('Varint overflow');
  }
  
  return { value: result, bytesRead };
}

/**
 * Base32编码 (IPFS CIDv1标准)
 * @param {Buffer} buffer - 输入数据
 * @returns {string} - Base32编码字符串
 */
function toBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  
  // 添加填充使其成为8的倍数
  while (output.length % 8 !== 0) {
    output += '=';
  }
  
  return 'b' + output;
}

/**
 * Base32解码
 * @param {string} str - Base32字符串
 * @returns {Buffer} - 解码后的Buffer
 */
function fromBase32(str) {
  if (str[0] !== 'b') throw new Error('Invalid CIDv1 Base32 string');
  
  const clean = str.slice(1).replace(/=/g, '').toLowerCase();
  const result = [];
  let bits = 0;
  let value = 0;
  
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid Base32 character: ${char}`);
    
    value = (value << 5) | index;
    bits += 5;
    
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  
  return Buffer.from(result);
}

// ============================================================================
// CIDv1生成器
// ============================================================================

class CIDv1Generator {
  /**
   * 生成CIDv1
   * @param {Buffer} data - 原始数据
   * @param {string} codec - 编解码器名称 (默认'dag-pb')
   * @param {string} hashAlg - 哈希算法 (默认'sha2-256')
   * @returns {string} - Base32编码的CID
   */
  static generate(data, codec = 'dag-pb', hashAlg = 'sha2-256') {
    const codecCode = codec === 'dag-pb' ? CODEC_DAG_PB : CODEC_RAW;
    const hashCode = hashAlg === 'sha2-256' ? HASH_SHA2_256 : HASH_BLAKE3;
    
    // 计算Multihash
    const hash = createHash('sha256').update(data).digest();
    const multihash = Buffer.concat([
      Buffer.from([hashCode, hash.length]),
      hash
    ]);
    
    // CID = 版本前缀 + 编码 + Multihash
    const cid = Buffer.concat([
      Buffer.from([CID_VERSION, codecCode]),
      multihash
    ]);
    
    return toBase32(cid);
  }
  
  /**
   * 解析CID字符串
   * @param {string} cidStr - CID字符串
   * @returns {{version: number, codec: number, hashAlg: number, hash: Buffer}} - 解析结果
   */
  static parse(cidStr) {
    const data = fromBase32(cidStr);
    
    if (data[0] !== CID_VERSION) {
      throw new Error(`Unsupported CID version: ${data[0]}`);
    }
    
    const version = data[0];
    const codec = data[1];
    const hashAlg = data[2];
    const hashLen = data[3];
    const hash = data.slice(4, 4 + hashLen);
    
    return { version, codec, hashAlg, hash };
  }
  
  /**
   * 验证数据与CID匹配
   * @param {string} cidStr - CID字符串
   * @param {Buffer} data - 待验证数据
   * @returns {boolean} - 是否匹配
   */
  static verify(cidStr, data) {
    try {
      const parsed = this.parse(cidStr);
      const computed = createHash('sha256').update(data).digest();
      return computed.equals(parsed.hash);
    } catch {
      return false;
    }
  }
}

// ============================================================================
// DAG-PB节点实现
// ============================================================================

/**
 * DAG-PB节点 - IPFS有向无环图Protocol Buffers格式
 * 与BSDiff的线性指令流形成鲜明对比
 */
class DAGPBNode {
  /**
   * @param {Buffer} data - 节点数据
   */
  constructor(data = Buffer.alloc(0)) {
    this.data = data;
    this.links = []; // 子节点引用数组
  }
  
  /**
   * 添加链接
   * @param {string} name - 链接名称
   * @param {string} cid - 目标CID
   * @param {number} size - 目标大小
   */
  addLink(name, cid, size) {
    this.links.push({
      Name: name,
      Hash: cid,
      Tsize: size
    });
  }
  
  /**
   * 序列化为Protocol Buffers格式
   * @returns {Buffer} - PB编码数据
   */
  serialize() {
    const parts = [];
    
    // 序列化链接 (field 2, repeated)
    for (const link of this.links) {
      const linkParts = [];
      
      // Name (field 1, wire type 2)
      if (link.Name) {
        const nameBuf = Buffer.from(link.Name);
        linkParts.push(Buffer.from([0x0a]));
        linkParts.push(encodeVarint(nameBuf.length));
        linkParts.push(nameBuf);
      }
      
      // Hash/CID (field 2, wire type 2)
      const cidBuf = fromBase32(link.Hash);
      linkParts.push(Buffer.from([0x12]));
      linkParts.push(encodeVarint(cidBuf.length));
      linkParts.push(cidBuf);
      
      // Tsize (field 3, wire type 0)
      linkParts.push(Buffer.from([0x18]));
      linkParts.push(encodeVarint(link.Tsize));
      
      // 链接作为嵌套消息 (field 2)
      const linkData = Buffer.concat(linkParts);
      parts.push(Buffer.from([0x12]));
      parts.push(encodeVarint(linkData.length));
      parts.push(linkData);
    }
    
    // Data (field 1, wire type 2)
    if (this.data.length > 0) {
      parts.push(Buffer.from([0x0a]));
      parts.push(encodeVarint(this.data.length));
      parts.push(this.data);
    }
    
    return Buffer.concat(parts);
  }
  
  /**
   * 从PB数据解析节点
   * @param {Buffer} data - PB编码数据
   * @returns {DAGPBNode} - 解析后的节点
   */
  static parse(data) {
    const node = new DAGPBNode();
    let offset = 0;
    let currentLink = null;
    
    while (offset < data.length) {
      const tag = data[offset++];
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;
      
      if (wireType === 2) { // length-delimited
        const { value: length, bytesRead } = decodeVarint(data, offset);
        offset += bytesRead;
        const fieldData = data.slice(offset, offset + length);
        offset += length;
        
        if (fieldNum === 1) {
          node.data = fieldData;
        } else if (fieldNum === 2) {
          // 解析嵌套链接
          currentLink = {};
          let linkOffset = 0;
          
          while (linkOffset < fieldData.length) {
            const linkTag = fieldData[linkOffset++];
            const linkField = linkTag >>> 3;
            const linkWire = linkTag & 0x07;
            
            if (linkWire === 2) {
              const { value: ll, bytesRead: lbr } = decodeVarint(fieldData, linkOffset);
              linkOffset += lbr;
              const linkValue = fieldData.slice(linkOffset, linkOffset + ll);
              linkOffset += ll;
              
              if (linkField === 1) currentLink.Name = linkValue.toString();
              else if (linkField === 2) currentLink.Hash = toBase32(linkValue);
            } else if (linkWire === 0) {
              const { value: lv, bytesRead: lbr } = decodeVarint(fieldData, linkOffset);
              linkOffset += lbr;
              if (linkField === 3) currentLink.Tsize = lv;
            }
          }
          
          if (currentLink.Hash) {
            node.links.push(currentLink);
          }
        }
      }
    }
    
    return node;
  }
  
  /**
   * 计算节点CID
   * @returns {string} - 节点CID
   */
  getCID() {
    return CIDv1Generator.generate(this.serialize());
  }
}

// ============================================================================
// HAJIMI-DIFF v3.0 IPFS格式主类
// ============================================================================

/**
 * HAJIMI-DIFF v3.0 - IPFS内容寻址格式
 * 
 * 与BSDiff的核心差异:
 * - BSDiff: 线性指令流 (控制块→差分块→额外块)
 * - IPFS:   图结构 (CID链接构成的DAG)
 */
class HajimiDiffIPFS {
  constructor() {
    this.cidGenerator = CIDv1Generator;
    this.nodes = new Map(); // CID -> 节点数据缓存
  }
  
  /**
   * 创建diff的IPFS表示
   * @param {Buffer} oldData - 旧文件数据
   * @param {Buffer} newData - 新文件数据
   * @param {Array} instructions - 差分指令集
   * @returns {Object} - IPFS格式diff对象
   */
  createDiff(oldData, newData, instructions) {
    // 1. 内容寻址存储原始数据
    const oldCID = this.cidGenerator.generate(oldData);
    const newCID = this.cidGenerator.generate(newData);
    
    this.nodes.set(oldCID, oldData);
    this.nodes.set(newCID, newData);
    
    // 2. 序列化指令集并存储
    const instructionsData = this.serializeInstructions(instructions);
    const instructionsCID = this.cidGenerator.generate(instructionsData);
    this.nodes.set(instructionsCID, instructionsData);
    
    // 3. 提取并存储数据块 (Add指令的数据)
    const blocks = this.extractBlocks(instructions);
    const blockCIDs = [];
    
    // 4. 创建Delta节点
    const deltaNode = new DAGPBNode(Buffer.from('patience-diff-v1'));
    deltaNode.addLink('instructions', instructionsCID, instructionsData.length);
    
    // 存储块数据
    for (const block of blocks) {
      const cid = this.cidGenerator.generate(block.data);
      blockCIDs.push({
        cid,
        size: block.data.length,
        range: block.range,
        index: block.index
      });
      this.nodes.set(cid, block.data);
      deltaNode.addLink(`block-${block.index}`, cid, block.data.length);
    }
    
    const deltaData = deltaNode.serialize();
    const deltaCID = this.cidGenerator.generate(deltaData);
    this.nodes.set(deltaCID, deltaData);
    
    // 5. 创建根节点
    const rootNode = new DAGPBNode(Buffer.from('hajimi-diff-v3.0'));
    rootNode.addLink('old', oldCID, oldData.length);
    rootNode.addLink('new', newCID, newData.length);
    rootNode.addLink('delta', deltaCID, deltaData.length);
    
    // 添加元数据
    const metaData = Buffer.from(JSON.stringify({
      format: 'hajimi-diff-v3.0',
      codec: 'dag-pb',
      created: new Date().toISOString(),
      blockCount: blocks.length,
      instructionCount: instructions.length
    }));
    const metaCID = this.cidGenerator.generate(metaData);
    this.nodes.set(metaCID, metaData);
    rootNode.addLink('meta', metaCID, metaData.length);
    
    const rootData = rootNode.serialize();
    const rootCID = this.cidGenerator.generate(rootData);
    this.nodes.set(rootCID, rootData);
    
    return {
      rootCID,
      oldCID,
      newCID,
      deltaCID,
      instructionsCID,
      metaCID,
      blockCIDs,
      rootNode,
      deltaNode,
      nodes: this.nodes
    };
  }
  
  /**
   * 序列化指令集
   * @param {Array} instructions - 指令数组
   * @returns {Buffer} - 序列化数据
   */
  serializeInstructions(instructions) {
    const buffers = [];
    
    // 写入指令数量
    buffers.push(encodeVarint(instructions.length));
    
    for (const inst of instructions) {
      // 类型字节 (1=ADD, 2=COPY, 3=RUN)
      let typeCode;
      switch (inst.type) {
        case 'ADD': typeCode = 0x01; break;
        case 'COPY': typeCode = 0x02; break;
        case 'RUN': typeCode = 0x03; break;
        default: typeCode = 0x00;
      }
      buffers.push(Buffer.from([typeCode]));
      
      // 索引
      const idx = inst.newIndex !== undefined ? inst.newIndex : inst.oldIndex;
      buffers.push(encodeVarint(idx));
      
      // 长度
      const len = inst.length !== undefined ? inst.length : 
                  (inst.data ? inst.data.length : 0);
      buffers.push(encodeVarint(len));
      
      // 数据 (ADD类型)
      if (inst.type === 'ADD' && inst.data) {
        buffers.push(inst.data);
      }
      // 填充字节 (RUN类型)
      else if (inst.type === 'RUN' && inst.fillByte !== undefined) {
        buffers.push(Buffer.from([inst.fillByte]));
      }
    }
    
    return Buffer.concat(buffers);
  }
  
  /**
   * 从指令中提取数据块
   * @param {Array} instructions - 指令数组
   * @returns {Array} - 数据块数组
   */
  extractBlocks(instructions) {
    const blocks = [];
    let blockIndex = 0;
    
    for (const inst of instructions) {
      if (inst.type === 'ADD' && inst.data && inst.data.length > 0) {
        blocks.push({
          index: blockIndex++,
          data: inst.data,
          range: [
            inst.newIndex || 0,
            (inst.newIndex || 0) + inst.data.length
          ]
        });
      }
    }
    
    return blocks;
  }
  
  /**
   * 从IPFS格式解析diff
   * @param {string} rootCID - 根CID
   * @param {Function} contentProvider - 内容提供函数 (cid) => Promise<Buffer>
   * @returns {Promise<Object>} - 解析结果
   */
  async parseDiff(rootCID, contentProvider) {
    // 获取根节点
    const rootData = await contentProvider(rootCID);
    const rootNode = DAGPBNode.parse(rootData);
    
    // 提取链接
    const oldCID = this.getLinkCID(rootNode, 'old');
    const newCID = this.getLinkCID(rootNode, 'new');
    const deltaCID = this.getLinkCID(rootNode, 'delta');
    const metaCID = this.getLinkCID(rootNode, 'meta');
    
    // 获取Delta节点
    const deltaData = await contentProvider(deltaCID);
    const deltaNode = DAGPBNode.parse(deltaData);
    
    // 获取指令
    const instructionsCID = this.getLinkCID(deltaNode, 'instructions');
    const instructionsData = await contentProvider(instructionsCID);
    const instructions = this.parseInstructions(instructionsData);
    
    // 获取元数据
    let metadata = {};
    if (metaCID) {
      try {
        const metaData = await contentProvider(metaCID);
        metadata = JSON.parse(metaData.toString());
      } catch (e) {
        // 元数据解析失败不阻断主流程
      }
    }
    
    return {
      rootCID,
      oldCID,
      newCID,
      deltaCID,
      instructionsCID,
      metaCID,
      instructions,
      metadata,
      rootNode,
      deltaNode
    };
  }
  
  /**
   * 从节点获取链接CID
   * @param {DAGPBNode} node - DAG节点
   * @param {string} name - 链接名称
   * @returns {string|null} - CID或null
   */
  getLinkCID(node, name) {
    const link = node.links.find(l => l.Name === name);
    return link ? link.Hash : null;
  }
  
  /**
   * 解析指令集
   * @param {Buffer} data - 序列化指令数据
   * @returns {Array} - 指令数组
   */
  parseInstructions(data) {
    const instructions = [];
    let offset = 0;
    
    // 读取指令数量
    const { value: count, bytesRead: cr } = decodeVarint(data, offset);
    offset += cr;
    
    for (let i = 0; i < count && offset < data.length; i++) {
      const typeCode = data[offset++];
      const type = typeCode === 0x01 ? 'ADD' : 
                   typeCode === 0x02 ? 'COPY' : 
                   typeCode === 0x03 ? 'RUN' : 'UNKNOWN';
      
      const { value: idx, bytesRead: ir } = decodeVarint(data, offset);
      offset += ir;
      
      const { value: len, bytesRead: lr } = decodeVarint(data, offset);
      offset += lr;
      
      const inst = { type };
      
      if (type === 'ADD') {
        inst.newIndex = idx;
        inst.length = len;
        inst.data = data.slice(offset, offset + len);
        offset += len;
      } else if (type === 'COPY') {
        inst.oldIndex = idx;
        inst.length = len;
      } else if (type === 'RUN') {
        inst.newIndex = idx;
        inst.length = len;
        inst.fillByte = data[offset++];
      }
      
      instructions.push(inst);
    }
    
    return instructions;
  }
  
  /**
   * 应用diff重建新文件
   * @param {Buffer} oldData - 旧文件数据
   * @param {Array} instructions - 指令集
   * @returns {Buffer} - 重建的新文件
   */
  applyDiff(oldData, instructions) {
    const chunks = [];
    let currentOffset = 0;
    
    for (const inst of instructions) {
      switch (inst.type) {
        case 'ADD':
          if (inst.data) {
            chunks.push(inst.data);
            currentOffset += inst.data.length;
          }
          break;
          
        case 'COPY':
          if (inst.oldIndex !== undefined && inst.length) {
            const copyData = oldData.slice(inst.oldIndex, inst.oldIndex + inst.length);
            chunks.push(copyData);
            currentOffset += copyData.length;
          }
          break;
          
        case 'RUN':
          if (inst.length && inst.fillByte !== undefined) {
            chunks.push(Buffer.alloc(inst.length, inst.fillByte));
            currentOffset += inst.length;
          }
          break;
      }
    }
    
    return Buffer.concat(chunks);
  }
  
  /**
   * 验证diff完整性
   * @param {Object} diffResult - createDiff的结果
   * @param {Function} contentProvider - 内容提供函数
   * @returns {Promise<boolean>} - 验证结果
   */
  async verifyDiff(diffResult, contentProvider) {
    try {
      // 验证根节点
      const rootData = await contentProvider(diffResult.rootCID);
      if (!CIDv1Generator.verify(diffResult.rootCID, rootData)) {
        return false;
      }
      
      // 验证旧数据
      const oldData = await contentProvider(diffResult.oldCID);
      if (!CIDv1Generator.verify(diffResult.oldCID, oldData)) {
        return false;
      }
      
      // 验证新数据
      const newData = await contentProvider(diffResult.newCID);
      if (!CIDv1Generator.verify(diffResult.newCID, newData)) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 导出为可传输格式
   * @param {Object} diffResult - createDiff的结果
   * @returns {Object} - 可序列化的导出对象
   */
  exportDiff(diffResult) {
    const exportObj = {
      rootCID: diffResult.rootCID,
      oldCID: diffResult.oldCID,
      newCID: diffResult.newCID,
      deltaCID: diffResult.deltaCID,
      instructionsCID: diffResult.instructionsCID,
      metaCID: diffResult.metaCID,
      blockCIDs: diffResult.blockCIDs,
      nodes: {}
    };
    
    // 导出所有节点数据 (Base64编码)
    for (const [cid, data] of diffResult.nodes) {
      exportObj.nodes[cid] = data.toString('base64');
    }
    
    return exportObj;
  }
  
  /**
   * 从导出对象导入
   * @param {Object} exportObj - 导出的对象
   * @returns {Object} - 可使用的diff对象
   */
  importDiff(exportObj) {
    const nodes = new Map();
    
    for (const [cid, base64Data] of Object.entries(exportObj.nodes)) {
      nodes.set(cid, Buffer.from(base64Data, 'base64'));
    }
    
    return {
      ...exportObj,
      nodes,
      contentProvider: (cid) => {
        const data = nodes.get(cid);
        if (!data) throw new Error(`Content not found: ${cid}`);
        return Promise.resolve(data);
      }
    };
  }
}

// ============================================================================
// UnixFS兼容层 (可选)
// ============================================================================

/**
 * UnixFS格式支持 - 用于大文件分块存储
 */
class UnixFSNode {
  constructor() {
    this.type = 'file';
    this.blockSize = 262144; // 256KB默认块大小
    this.blocks = [];
  }
  
  /**
   * 将大文件分块
   * @param {Buffer} data - 文件数据
   * @returns {Array<{cid: string, data: Buffer}>} - 块数组
   */
  chunkFile(data) {
    const chunks = [];
    let offset = 0;
    let index = 0;
    
    while (offset < data.length) {
      const block = data.slice(offset, offset + this.blockSize);
      const cid = CIDv1Generator.generate(block, 'raw');
      
      chunks.push({
        index: index++,
        cid,
        data: block,
        size: block.length
      });
      
      offset += block.length;
    }
    
    this.blocks = chunks;
    return chunks;
  }
  
  /**
   * 创建UnixFS风格的平衡树
   * @returns {DAGPBNode} - 根节点
   */
  buildTree() {
    if (this.blocks.length === 0) return new DAGPBNode();
    
    // 构建平衡树
    const buildLevel = (blocks) => {
      if (blocks.length === 1) {
        const node = new DAGPBNode();
        node.addLink('data', blocks[0].cid, blocks[0].size);
        return node;
      }
      
      const mid = Math.ceil(blocks.length / 2);
      const left = buildLevel(blocks.slice(0, mid));
      const right = buildLevel(blocks.slice(mid));
      
      const node = new DAGPBNode();
      node.addLink('left', left.getCID(), left.serialize().length);
      node.addLink('right', right.getCID(), right.serialize().length);
      
      return node;
    };
    
    return buildLevel(this.blocks);
  }
}

// ============================================================================
// 导出模块
// ============================================================================

module.exports = {
  // 核心类
  CIDv1Generator,
  DAGPBNode,
  HajimiDiffIPFS,
  UnixFSNode,
  
  // 工具函数
  encodeVarint,
  decodeVarint,
  toBase32,
  fromBase32,
  
  // 常量
  CONSTANTS: {
    CID_VERSION,
    CODEC_DAG_PB,
    CODEC_RAW,
    HASH_SHA2_256,
    HASH_BLAKE3
  }
};

// ============================================================================
// 自测代码
// ============================================================================

if (require.main === module) {
  console.log('=== HAJIMI-DIFF v3.0 IPFS格式自测 ===\n');
  
  // 测试1: CID生成与验证
  console.log('测试1: CIDv1生成与验证');
  const testData = Buffer.from('Hello, IPFS!');
  const cid = CIDv1Generator.generate(testData);
  console.log(`  数据: ${testData.toString()}`);
  console.log(`  CID: ${cid}`);
  console.log(`  验证: ${CIDv1Generator.verify(cid, testData) ? '✅' : '❌'}`);
  
  // 测试2: DAG-PB序列化
  console.log('\n测试2: DAG-PB节点');
  const node = new DAGPBNode(Buffer.from('test node'));
  node.addLink('child1', cid, testData.length);
  const nodeCID = node.getCID();
  console.log(`  节点CID: ${nodeCID}`);
  const parsed = DAGPBNode.parse(node.serialize());
  console.log(`  数据匹配: ${parsed.data.equals(node.data) ? '✅' : '❌'}`);
  console.log(`  链接数: ${parsed.links.length}`);
  
  // 测试3: 完整Diff流程
  console.log('\n测试3: 完整Diff流程');
  const diff = new HajimiDiffIPFS();
  const oldData = Buffer.from('Hello World!');
  const newData = Buffer.from('Hello IPFS World!');
  
  const instructions = [
    { type: 'COPY', oldIndex: 0, length: 6 },    // "Hello "
    { type: 'ADD', newIndex: 6, data: Buffer.from('IPFS ') },
    { type: 'COPY', oldIndex: 6, length: 6 }     // "World!"
  ];
  
  const result = diff.createDiff(oldData, newData, instructions);
  console.log(`  根CID: ${result.rootCID}`);
  console.log(`  旧CID: ${result.oldCID}`);
  console.log(`  新CID: ${result.newCID}`);
  console.log(`  块数: ${result.blockCIDs.length}`);
  console.log(`  节点总数: ${result.nodes.size}`);
  
  // 测试4: 往返解析
  console.log('\n测试4: 往返解析测试');
  const parsed2 = diff.parseDiff(result.rootCID, (cid) => {
    const data = result.nodes.get(cid);
    if (!data) throw new Error(`Missing: ${cid}`);
    return Promise.resolve(data);
  });
  
  parsed2.then(p => {
    console.log(`  解析成功: ${p.rootCID === result.rootCID ? '✅' : '❌'}`);
    console.log(`  指令数: ${p.instructions.length}`);
    
    // 测试5: 应用diff
    console.log('\n测试5: 应用Diff');
    const reconstructed = diff.applyDiff(oldData, p.instructions);
    console.log(`  原始: ${newData.toString()}`);
    console.log(`  重建: ${reconstructed.toString()}`);
    console.log(`  匹配: ${reconstructed.equals(newData) ? '✅' : '❌'}`);
    
    console.log('\n=== 所有测试完成 ===');
  });
}

'use strict'

import {readFile} from 'fs-promise'
import zlib from 'zlib'

const sectorSize = 512
const compressionMap = ['COMPRESSION_NONE', 'COMPRESSION_DEFLATE']

function parseS64b (buffer, offset, valueName) {
  const low = buffer.readInt32LE(offset)
  const high = buffer.readInt32LE(offset + 4)
  // here there might be a surprise here because we are reading 64 integers into double floats (53 bits mantissa)
  const value = low | high << 32
  if ((value & (Math.pow(2, 32) - 1)) !== low) {
    throw new Error('Unsupported VMDK, ' + valueName + ' is too big')
  }
  return value
}

function parseU64b (buffer, offset, valueName) {
  const low = buffer.readUInt32LE(offset)
  const high = buffer.readUInt32LE(offset + 4)
  // here there might be a surprise here because we are reading 64 integers into double floats (53 bits mantissa)
  const value = low | high << 32
  if ((value & (Math.pow(2, 32) - 1)) !== low) {
    throw new Error('Unsupported VMDK, ' + valueName + ' is too big')
  }
  return value
}

function parseDescriptor (descriptorSlice) {
  const descriptorText = descriptorSlice.toString('ascii').replace(/\x00+$/, '')
  const descriptorDict = {}
  const extentList = []
  const lines = descriptorText.split(/\r?\n/).filter((line) => {
    return line.trim().length > 0 && line[0] !== '#'
  })
  for (let line of lines) {
    let defLine = line.split('=')
    // the wonky quote test is to avoid having an equal sign in the name of an extent
    if (defLine.length === 2 && defLine[0].indexOf('"') === -1) {
      descriptorDict[defLine[0]] = defLine[1].replace(/['"]+/g, '')
    } else {
      const items = line.split(' ')
      extentList.push({
        access: items[0],
        sizeSectors: items[1],
        type: items[2],
        name: items[3],
        offset: items.length > 4 ? items[4] : 0
      })
    }
  }
  console.log(descriptorDict)
  console.log(extentList)
  return {descriptor: descriptorDict, extents: extentList}
}

function parseFlags (flagBuffer) {
  const number = flagBuffer.readUInt32LE(0)
  return {
    newLineTest: !!(number & (1 << 0)),
    useSecondaryGrain: !!(number & (1 << 1)),
    useZeroedGrainTable: !!(number & (1 << 2)),
    compressedGrains: !!(number & (1 << 16)),
    hasMarkers: !!(number & (1 << 17))
  }
}

function parseHeader (buffer) {
  const flags = parseFlags(buffer.slice(8, 12))
  const capacitySectors = parseU64b(buffer, 12, 'capacitySectors')
  const grainSizeSectors = parseU64b(buffer, 20, 'grainSizeSectors')
  const descriptorOffsetSectors = parseU64b(buffer, 28, 'descriptorOffsetSectors')
  const descriptorSizeSectors = parseU64b(buffer, 36, 'descriptorSizeSectors')
  const numGTEsPerGT = buffer.readUInt32LE(44)
  const grainDirectoryOffsetSectors = parseS64b(buffer, 56, 'grainDirectoryOffsetSectors')
  const overHeadSectors = parseS64b(buffer, 64, 'overHeadSectors')
  const compressionMethod = compressionMap[buffer.readUInt16LE(77)]
  const l1EntrySectors = numGTEsPerGT * grainSizeSectors
  console.log('flags', flags)
  console.log('capacitySectors', capacitySectors, ' -> ', capacitySectors * sectorSize, 'b')
  console.log('grainSizeSectors', grainSizeSectors, ' -> ', grainSizeSectors * sectorSize, 'b')
  console.log('descriptorOffsetSectors', descriptorOffsetSectors)
  console.log('descriptorSizeSectors', descriptorSizeSectors)
  console.log('numGTEsPerGT', numGTEsPerGT)
  console.log('grainDirectoryOffsetSectors', grainDirectoryOffsetSectors, ' -> ', grainDirectoryOffsetSectors * sectorSize, 'b')
  console.log('overHeadSectors', overHeadSectors, ' -> ', overHeadSectors * sectorSize, 'b')
  console.log('compressionMethod', compressionMethod)
  console.log('l1EntrySectors', l1EntrySectors)
  return {
    capacitySectors,
    descriptorOffsetSectors,
    descriptorSizeSectors,
    grainDirectoryOffsetSectors,
    l1EntrySectors,
    numGTEsPerGT
  }
}
async function readGrain (offsetSectors, buffer) {
  const offset = offsetSectors * sectorSize
  const size = buffer.readUInt32LE(offset + 8)
  const grainBuffer = buffer.slice(offset + 12, offset + 12 + size)
  const grainContent = await zlib.inflateSync(grainBuffer)
  return {
    offsetSectors: offsetSectors,
    offset,
    lba: parseU64b(buffer, offset, 'l2Lba'),
    size,
    buffer: grainBuffer,
    grain: grainContent,
    grainSize: grainContent.byteLength
  }
}

export async function readRawContent (fileName) {
  const buffer = await readFile(fileName)
  const magicString = buffer.slice(0, 4).toString('ascii')
  if (magicString !== 'KDMV') {
    throw new Error('not a VMDK file')
  }
  const version = buffer.readUInt32LE(4)
  if (version !== 1 && version !== 3) {
    throw new Error('unsupported VMDK version ' + version + ', only version 1 and 3 are supported')
  }
  let header = parseHeader(buffer)
  // I think the multiplications are OK, because the descriptor is always at the beginning of the file
  const descriptorEnd = (header.descriptorOffsetSectors + header.descriptorSizeSectors) * sectorSize
  const descriptorBuffer = buffer.slice(header.descriptorOffsetSectors * sectorSize, descriptorEnd)
  const descriptor = parseDescriptor(descriptorBuffer)

  if (header.grainDirectoryOffsetSectors === -1) {
    console.log('--- lets parse the footer ----')
    header = parseHeader(buffer.slice(-1024, -1024 + sectorSize))
  }
  const rawOutputBuffer = new Buffer(header.capacitySectors * sectorSize)
  rawOutputBuffer.fill(0)
  const l1Size = Math.floor((header.capacitySectors + header.l1EntrySectors - 1) / header.l1EntrySectors)
  const l2Size = header.numGTEsPerGT
  console.log('l1Size', l1Size, 'l2Size', l2Size)
  const l1 = []
  for (let i = 0; i < l1Size; i++) {
    const l1Entry = buffer.readUInt32LE(header.grainDirectoryOffsetSectors * sectorSize + 4 * i)
    if (l1Entry !== 0) {
      l1.push(l1Entry)
      const l2 = []
      for (let j = 0; j < l2Size; j++) {
        const l2Entry = buffer.readUInt32LE(l1Entry * sectorSize + 4 * j)
        if (l2Entry !== 0) {
          const grain = await readGrain(l2Entry, buffer)
          for (let k = 0; k < grain.grain.byteLength; k++) {
            rawOutputBuffer[grain.lba * sectorSize + k] = grain.grain[k]
          }
          l2[j] = grain
        }
      }
      console.log('-- l1 entry ', l1Entry, l2)
    }
  }
  console.log('-- l1', l1)
  const vmdkType = descriptor['descriptor']['createType']
  if (!vmdkType || vmdkType.toLowerCase() !== 'streamOptimized'.toLowerCase()) {
    throw new Error('unsupported VMDK type "' + vmdkType + '", only streamOptimized is supported')
  }
  return {descriptor: descriptor.descriptor, extents: descriptor.extents, rawFile: rawOutputBuffer}
}

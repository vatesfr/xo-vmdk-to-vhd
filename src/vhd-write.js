'use strict'
import {open, write} from 'fs-promise'

const footerCookie = 'conectix'
const creatorApp = 'xo  '
// it looks like every body is using Wi2k
const osString = 'Wi2k'
const headerCookie = 'cxsparse'
const dynamicHardDiskType = 3

const sectorSize = 512

export function computeChecksum (buffer) {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i]
  }
  // http://stackoverflow.com/a/1908655/72637 the >>> prevents the number from going negative
  return (~sum) >>> 0
}

class Block {
  constructor (blockSize) {
    const bitmapSize = blockSize / sectorSize / 8
    const bufferSize = Math.ceil((blockSize + bitmapSize) / sectorSize) * sectorSize
    this.buffer = new Buffer(bufferSize)
    this.buffer.fill(0)
    this.bitmapBuffer = this.buffer.slice(0, bitmapSize)
    this.dataBuffer = this.buffer.slice(bitmapSize)
    this.bitmapBuffer.fill(0xff)
  }

  writeData (buffer) {
    buffer.copy(this.dataBuffer)
  }

  async writeOnFile (file) {
    await write(file, this.buffer, 0, this.buffer.length)
  }
}

class SparseFile {
  constructor (dataSize, blockSize, startOffset) {
    this.table = createEmptyTable(dataSize, blockSize)
    this.blockSize = blockSize
    this.startOffset = (startOffset + this.table.buffer.length) / sectorSize
  }

  get entryCount () {
    return this.table.entryCount
  }

  _writeBlock (blockBuffer, tableIndex) {
    let entry = this.table.entries[tableIndex]
    if (entry === undefined) {
      entry = new Block(this.blockSize)
      this.table.entries[tableIndex] = entry
    }
    entry.writeData(blockBuffer)
  }

  writeBuffer (buffer) {
    const blockCount = Math.ceil(buffer.length / this.blockSize)
    for (let i = 0; i < blockCount; i++) {
      const blockBuffer = buffer.slice(i * this.blockSize, (i + 1) * this.blockSize)
      this._writeBlock(blockBuffer, i)
    }
  }

  async writeOnFile (file) {
    let currentOffset = this.startOffset
    for (let i = 0; i < this.table.entryCount; i++) {
      const block = this.table.entries[i]
      if (block !== undefined) {
        this.table.buffer.writeUInt32BE(currentOffset, i * 4)
        currentOffset += block.buffer.length / sectorSize
      }
    }
    await write(file, this.table.buffer, 0, this.table.buffer.length)
    for (let i = 0; i < this.table.entryCount; i++) {
      const block = this.table.entries[i]
      if (block !== undefined) {
        await block.writeOnFile(file)
      }
    }
  }
}

export function computeGeometryForSize (size) {
  let totalSectors = Math.ceil(size / 512)
  let sectorsPerTrack
  let heads
  let cylinderTimesHeads
  if (totalSectors > 65535 * 16 * 255) {
    throw Error('disk is too big')
  }
  // straight copypasta from the file spec appendix on CHS Calculation
  if (totalSectors >= 65535 * 16 * 63) {
    sectorsPerTrack = 255
    heads = 16
    cylinderTimesHeads = totalSectors / sectorsPerTrack
  } else {
    sectorsPerTrack = 17
    cylinderTimesHeads = totalSectors / sectorsPerTrack
    heads = Math.floor((cylinderTimesHeads + 1023) / 1024)
    if (heads < 4) {
      heads = 4
    }
    if (cylinderTimesHeads >= (heads * 1024) || heads > 16) {
      sectorsPerTrack = 31
      heads = 16
      cylinderTimesHeads = totalSectors / sectorsPerTrack
    }
    if (cylinderTimesHeads >= (heads * 1024)) {
      sectorsPerTrack = 63
      heads = 16
      cylinderTimesHeads = totalSectors / sectorsPerTrack
    }
  }
  let cylinders = Math.floor(cylinderTimesHeads / heads)
  let actualSize = cylinders * heads * sectorsPerTrack * sectorSize
  return {cylinders, heads, sectorsPerTrack, actualSize}
}

export function createFooter (size, timestamp, geometry) {
  let view = new Uint8Array(512)
  let footer = new Buffer(view.buffer)
  view.set(new Buffer(footerCookie, 'ascii'), 0)
  footer.writeUInt32BE(2, 8)
  footer.writeUInt32BE(0x00010000, 12)
  // hard code the position of the next structure, we have no reason to change it
  footer.writeUInt32BE(0, 16)
  footer.writeUInt32BE(512, 20)
  footer.writeUInt32BE(timestamp, 24)
  view.set(new Buffer(creatorApp, 'ascii'), 28)
  view.set(new Buffer(osString, 'ascii'), 36)
  const sizeHigh = Math.floor(size / Math.pow(2, 32)) & 0xFFFFFFFF
  const sizeLow = size & 0xFFFFFFFF
  footer.writeUInt32BE(sizeHigh, 40)
  footer.writeUInt32BE(sizeLow, 44)
  footer.writeUInt32BE(sizeHigh, 48)
  footer.writeUInt32BE(sizeLow, 52)
  footer.writeUInt16BE(geometry['cylinders'], 56)
  footer.writeUInt8(geometry['heads'], 58)
  footer.writeUInt8(geometry['sectorsPerTrack'], 59)
  footer.writeUInt32BE(dynamicHardDiskType, 60)
  let checksum = computeChecksum(footer)
  footer.writeUInt32BE(checksum, 64)
  return footer
}

export function createDynamicDiskHeader (tableEntries, blockSize) {
  let view = new Uint8Array(1024)
  let header = new Buffer(view.buffer)
  view.set(new Buffer(headerCookie, 'ascii'), 0)
  // hard code no next data
  header.writeUInt32BE(0xFFFFFFFF, 8)
  header.writeUInt32BE(0xFFFFFFFF, 12)
  // hard code table offset
  header.writeUInt32BE(0, 16)
  header.writeUInt32BE(sectorSize * 3, 20)
  header.writeUInt32BE(0x00010000, 24)
  header.writeUInt32BE(tableEntries, 28)
  header.writeUInt32BE(blockSize, 32)
  let checksum = computeChecksum(header)
  header.writeUInt32BE(checksum, 36)
  return header
}

export function createEmptyTable (dataSize, blockSize) {
  const blockCount = Math.ceil(dataSize / blockSize)
  const tableSizeSectors = Math.ceil(blockCount * 4 / sectorSize)
  const buffer = new Buffer(tableSizeSectors * sectorSize)
  buffer.fill(0xff)
  return {entryCount: blockCount, buffer: buffer, entries: []}
}

export async function createExpandedFile (fileName, dataBuffer, timestamp, geometry) {
  const dataSize = dataBuffer.length
  const fileFooter = createFooter(dataSize, timestamp, geometry)
  const blockSize = 0x00200000
  const spareFile = new SparseFile(dataSize, blockSize, sectorSize * 3)
  const diskHeader = createDynamicDiskHeader(spareFile.entryCount, blockSize)
  spareFile.writeBuffer(dataBuffer)
  const file = await open(fileName, 'w')
  await write(file, fileFooter, 0, fileFooter.length)
  await write(file, diskHeader, 0, diskHeader.length)
  await spareFile.writeOnFile(file)
  await write(file, fileFooter, 0, fileFooter.length)
}

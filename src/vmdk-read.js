'use strict'

import {readFile} from 'fs-promise'

const sectorSize = 512

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

export async function readGeometry (fileName) {
  const buffer = await readFile(fileName)
  const magicString = buffer.slice(0, 4).toString('ascii')
  if (magicString !== 'KDMV') {
    throw new Error('not a VMDK file')
  }
  const version = buffer.readUInt32LE(4)
  if (version !== 1 && version !== 3) {
    throw new Error('unsupported VMDK version ' + version + ', only version 1 and 3 are supported')
  }
  const flags = buffer.readUInt32LE(8)
  const capacitySectors = parseU64b(buffer, 12, 'capacitySectors')
  const grainSizeSectors = parseU64b(buffer, 20, 'grainSizeSectors')
  const descriptorOffsetSectors = parseU64b(buffer, 28, 'descriptorOffsetSectors')
  const descriptorSizeSectors = parseU64b(buffer, 36, 'descriptorSizeSectors')
  const grainDirectoryOffsetSectors = parseS64b(buffer, 56, 'grainDirectoryOffsetSectors')

  // const numGTEsPerGT = buffer.readUInt32LE(44)
  console.log('flags', flags.toString(2))
  console.log('capacitySectors', capacitySectors)
  console.log('grainSizeSectors', grainSizeSectors)
  console.log('descriptorOffsetSectors', descriptorOffsetSectors)
  console.log('descriptorSizeSectors', descriptorSizeSectors)
  console.log('grainDirectoryOffsetSectors', grainDirectoryOffsetSectors)
  const descriptorSlice = buffer.slice(descriptorOffsetSectors * sectorSize, (descriptorOffsetSectors + descriptorSizeSectors) * sectorSize)
  return parseDescriptor(descriptorSlice)
}

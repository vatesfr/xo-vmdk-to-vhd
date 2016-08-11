# xo-vmdk-to-vhd
[![Build Status](https://travis-ci.org/nraynaud/xo-vmdk-to-vhd.svg?branch=master)](https://travis-ci.org/nraynaud/xo-vmdk-to-vhd)
JS lib streaming a vmdk file to a vhd

To install: 

```
$ npm install vatesfr/xo-vmdk-to-vhd
```

To convert a VMDK stream to a Fixed VHD stream without buffering the entire input or output:
```
import convertFromVMDK from 'xo-vmdk-to-vhd'
import {createReadStream, createWriteStream} from 'fs-promise'

const pipe = (await convertFromVMDK(fs.createReadStream(vmdkFileName))).pipe(fs.createWriteStream(vhdFileName))
    await new Promise((resolve, reject) => {
      pipe.on('finish', resolve)
      pipe.on('error', reject)
    })
```

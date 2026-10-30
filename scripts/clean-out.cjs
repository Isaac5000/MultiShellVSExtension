'use strict';
const fs=require('node:fs');
const path=require('node:path');
const out=path.resolve(__dirname,'../out');
fs.rmSync(out,{recursive:true,force:true});

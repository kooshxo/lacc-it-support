import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key(){const value=Buffer.from(process.env.REQUEST_SECRETS_KEY??'','base64');if(value.length!==32)throw new Error('PIN storage is not configured.');return value;}
export function encryptPin(pin:string,uid:string){const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(uid));const encrypted=Buffer.concat([cipher.update(pin,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');}
export function decryptPin(value:string,uid:string){const bytes=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));decipher.setAAD(Buffer.from(uid));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}

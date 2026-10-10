// @ts-ignore
import app from '../dist/server.js';

export default function handler(req: any, res: any) {
  return app(req, res);
}

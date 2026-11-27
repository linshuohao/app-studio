import { retainedWebCapabilities } from '@studio-retained/web-capabilities';
import { installedWebCapabilities, webPreviewCapabilities } from '../web-capabilities';

export const releaseWebCapabilities = [installedWebCapabilities, ...retainedWebCapabilities];
export const previewWebCapabilities = [webPreviewCapabilities, ...releaseWebCapabilities];

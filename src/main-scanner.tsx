import './index.css';
import { mountApplication } from '@/app/mountApplication';

mountApplication(() => import('@/app/ScannerApplication'));

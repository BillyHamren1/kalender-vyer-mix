import './index.css'
import { mountApplication } from '@/app/mountApplication'

mountApplication(() => import('./App'))

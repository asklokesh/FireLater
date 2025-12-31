// Import config
import { config } from '../config';

// In the register route handler, replace the hardcoded salt rounds
const hashedPassword = await bcrypt.hash(password, config.auth.saltRounds);
class Logger {
    static timestamp() {
        return new Date().toISOString();
    }

    static format(level, message) {
        return `[${this.timestamp()}] ${level}: ${message}`;
    }

    static info(message) {
        console.log(this.format('INFO', message));
    }

    static success(message) {
        console.log(this.format('SUCCESS', message));
    }

    static warn(message) {
        console.warn(this.format('WARN', message));
    }

    static error(message) {
        console.error(this.format('ERROR', message));
    }

    static debug(message) {
        if (process.env.DEBUG) {
            console.debug(this.format('DEBUG', message));
        }
    }

    static progress(message) {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        const interval = setInterval(() => {
            process.stdout.write(`\r${frames[i]} ${message}`);
            i = (i + 1) % frames.length;
        }, 80);

        return {
            succeed: (text) => {
                clearInterval(interval);
                process.stdout.write(`\r✨ ${text}\n`);
            },
            fail: (text) => {
                clearInterval(interval);
                process.stdout.write(`\r✖ ${text}\n`);
            }
        };
    }
}

module.exports = Logger;

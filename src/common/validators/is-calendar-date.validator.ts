import { registerDecorator, ValidationOptions, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Validates a strict YYYY-MM-DD calendar date. The regex alone (or @IsDateString) would accept
// impossible dates like 2026-13-99 or 2026-02-30, which `new Date(year, month - 1, day)` rolls
// over silently into a different day. This round-trips the parsed parts through that same Date
// construction so anything that validates is guaranteed safe for consumers building dates that way.
@ValidatorConstraint({ name: 'isCalendarDate', async: false })
class IsCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    const match = CALENDAR_DATE_PATTERN.exec(value);
    if (!match) return false;

    const [, year, month, day] = match.map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  defaultMessage(): string {
    return 'date must be a valid calendar date in YYYY-MM-DD format';
  }
}

export function IsCalendarDate(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: IsCalendarDateConstraint,
    });
  };
}

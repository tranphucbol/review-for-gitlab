import dayjs from 'dayjs';
import dayjsUtc from 'dayjs/plugin/utc';
import dayjsTimezone from 'dayjs/plugin/timezone';
import dayjsRelativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(dayjsRelativeTime);
dayjs.extend(dayjsUtc);
dayjs.extend(dayjsTimezone);

dayjs.tz.setDefault(Intl.DateTimeFormat().resolvedOptions().timeZone);

const ABSOLUTE_FORMAT = 'MMM D, YYYY h:mma [GMT]ZZ';

const parse = date => {
  const parsed = date ? dayjs(date) : undefined;
  return parsed?.isValid() ? parsed : undefined;
};

/** "3 hours ago", or an empty string for a missing or invalid date */
export const relativeDate = (date, now) => {
  const parsed = parse(date);
  if (!parsed) return '';
  return now ? parsed.from(now) : parsed.fromNow();
};

/** "Jan 5, 2024 2:30pm GMT+0700", the date GitLab's web page shows on hover */
export const absoluteDate = date => parse(date)?.format(ABSOLUTE_FORMAT) ?? '';

/** the machine-readable value for `<time datetime>` */
export const isoDate = date => parse(date)?.toISOString() ?? '';

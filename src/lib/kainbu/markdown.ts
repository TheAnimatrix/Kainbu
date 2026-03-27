import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
	gfm: true,
	breaks: true
});

export const renderMarkdown = (value: string) => {
	const raw = marked.parse(value || '', { async: false });
	return DOMPurify.sanitize(raw, {
		ADD_TAGS: ['input'],
		ADD_ATTR: ['checked', 'disabled', 'type']
	});
};

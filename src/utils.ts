import mime from 'mime';

export const isBinary = (file: string): boolean => {
    var _mime = mime.getType(file);
    if (!_mime) return true;
    var [mime_type, sub_type] = _mime.split('/');
    if (mime_type == "text")
        return false
    if (mime_type != "application")
        return true;
    return !["json", "ld+json", "x-httpd-php", "x-sh", "x-csh", "xhtml+xml", "xml"].includes(sub_type)
}
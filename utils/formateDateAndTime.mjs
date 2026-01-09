export const formateDataAndTime = (dateAndTimeString) => {
	const dateObject = new Date(dateAndTimeString);
	const day = dateObject.getDate();
	const month = dateObject.getMonth() + 1;
	const year = dateObject.getFullYear();
	const hours = dateObject.getHours();
	const minutes = dateObject.getMinutes();
	const ampm = hours >= 12 ? "PM" : "AM";
	const formattedHours = hours % 12 || 12; // Convert hours to 12-hour format
	const formattedMinutes = minutes.toString().padStart(2, "0");

	const formattedDate = `${day}-${month}-${year}`;
	const formattedTime = `${formattedHours}:${formattedMinutes} ${ampm}`;

	return `${formattedDate}, ${formattedTime}`;
};
